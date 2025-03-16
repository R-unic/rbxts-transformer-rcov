import ts, { ConciseBody } from "typescript";

/**
 * This is the transformer's configuration, the values are passed from the tsconfig.
 */
export interface TransformerConfig {
  ignoreGlobs: string[];
}

/**
 * This is a utility object to pass around your dependencies.
 *
 * You can also use this object to store state, e.g prereqs.
 */
export class TransformContext {
  public factory: ts.NodeFactory;

  constructor(
    public program: ts.Program,
    public context: ts.TransformationContext,
    public config: TransformerConfig,
  ) {
    this.factory = context.factory;
  }

  /**
   * Transforms the children of the specified node.
   */
  transform<T extends ts.Node>(node: T): T {
    return ts.visitEachChild(node, node => visitNode(this, node), this.context);
  }
}

function visitStatement(context: TransformContext, node: ts.Statement): ts.Statement | ts.Statement[] {
  const { factory } = context;
  const sourceFile = getSourceFile(node);
  if (sourceFile === undefined) {
    const diagnostic = ts.createDiagnosticForNode(node, {
      key: "", code: 400,
      category: ts.DiagnosticCategory.Warning,
      message: `Failed to find source file for ${node.kind} node`
    });
    context.context.addDiagnostic(diagnostic);
    return node;
  }

  const nodeStartLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
  return [
    context.transform(node),
    factory.createExpressionStatement(
      factory.createCallExpression(
        factory.createPropertyAccessExpression(
          factory.createIdentifier("rcov"),
          factory.createIdentifier("track")
        ),
        undefined,
        [
          factory.createStringLiteral(sourceFile.fileName),
          factory.createNumericLiteral(nodeStartLine + 1),
        ]
      )
    )
  ];
}

function visitExpression(context: TransformContext, node: ts.Expression): ts.Expression {
  // This can be used to transform expressions
  // For example, a call expression for macros.

  return context.transform(node);
}

function visitBlock(context: TransformContext, node: ts.Block): ts.Block {
  return context.factory.updateBlock(node, node.statements.map(s => visitStatement(context, s)).flat());
}

function visitFunctionLikeDeclaration(context: TransformContext, node: ts.FunctionLikeDeclaration): ts.FunctionLikeDeclaration {
  const { factory } = context;
  let newBody = node.body as ts.Block | undefined;
  if (node.body !== undefined)
    if (ts.isBlock(node.body))
      newBody = visitBlock(context, node.body);
    else if (ts.isExpression(node.body))
      newBody = visitBlock(context, factory.createBlock([factory.createExpressionStatement(node.body)]));

  if (node.body === newBody)
    return context.transform(node);

  if (ts.isFunctionDeclaration(node))
    return factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, newBody);
  else if (ts.isFunctionExpression(node))
    return factory.updateFunctionExpression(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, newBody!);
  else if (ts.isArrowFunction(node))
    return factory.updateArrowFunction(node, node.modifiers, node.typeParameters, node.parameters, node.type, node.equalsGreaterThanToken, newBody as ConciseBody);
  else if (ts.isMethodDeclaration(node))
    return factory.updateMethodDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.questionToken, node.typeParameters, node.parameters, node.type, newBody);
  else if (ts.isGetAccessorDeclaration(node))
    return factory.updateGetAccessorDeclaration(node, node.modifiers, node.name, node.parameters, node.type, newBody);
  else if (ts.isSetAccessorDeclaration(node))
    return factory.updateSetAccessorDeclaration(node, node.modifiers, node.name, node.parameters, newBody);

  return factory.updateConstructorDeclaration(node, node.modifiers, node.parameters, newBody);
}

function visitNode(context: TransformContext, node: ts.Node): ts.Node | ts.Node[] {
  console.log(ts.SyntaxKind[node.kind], ts.isStatement(node) || ts.isBlock(node) || ts.isFunctionLikeDeclaration(node));
  if (ts.isStatement(node))
    return visitStatement(context, node);
  else if (ts.isExpression(node))
    return visitExpression(context, node)
  else if (ts.isBlock(node))
    return visitBlock(context, node);
  else if (ts.isFunctionLikeDeclaration(node))
    return visitFunctionLikeDeclaration(context, node);

  // We encountered a node that we don't handle above,
  // but we should keep iterating the AST in case we find something we want to transform.
  return context.transform(node);
}

function getSourceFile(node: ts.Node, checkParent = true): ts.SourceFile | undefined {
  if (node.parent === undefined)
    return getDescendants(node).map(c => getSourceFile(c, false)).filter(v => v !== undefined)[0];

  return node.getSourceFile() ?? (checkParent ? getSourceFile(node.parent) : undefined);
}

function getDescendants(node: ts.Node): ts.Node[] {
  const children = node.getChildren();
  return [
    ...children,
    ...children.map(getDescendants).flat()
  ]
}
