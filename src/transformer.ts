import ts, { ConciseBody, ExpressionStatement } from "typescript";

/**
 * This is the transformer's configuration, the values are passed from the tsconfig.
 */
export interface TransformerConfig {
  ignoreGlobs?: string[];
}

/**
 * This is a utility object to pass around your dependencies.
 *
 * You can also use this object to store state, e.g prereqs.
 */
export class TransformContext {
  public factory: ts.NodeFactory;
  public sourceFile?: ts.SourceFile;

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
  public transform<T extends ts.Node>(node: T): T {
    this.checkSourceFile(node);
    return ts.visitEachChild(node, child => visitNode(this, child), this.context);
  }

  public checkSourceFile(node: ts.Node): void {
    if (this.sourceFile !== undefined) return;
    if (!ts.isSourceFile(node)) return;
    this.sourceFile = node;
  }
}

function visitStatement(context: TransformContext, node: ts.Statement): ts.Statement | ts.Statement[] {
  if (ts.isReturnStatement(node) || ts.isContinueStatement(node) || ts.isBreakStatement(node))
    return node;

  context.checkSourceFile(node);
  const { factory, sourceFile } = context;
  if (sourceFile === undefined) {
    const message = `Failed to find source file for ${ts.SyntaxKind[node.kind]} node`;
    const diagnostic = ts.createDiagnosticForNode(node, {
      key: "", code: 400,
      category: ts.DiagnosticCategory.Warning,
      message
    });
    console.warn(message);
    context.context.addDiagnostic(diagnostic);
    return node;
  }

  try {
    const nodeStartLine = sourceFile.getLineAndCharacterOfPosition((getDefinedOriginal(node) ?? node).getStart(sourceFile)).line;
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
            factory.createStringLiteral(context.program.getCanonicalFileName(sourceFile.fileName)),
            factory.createNumericLiteral(nodeStartLine + 1),
          ]
        )
      )
    ];
  } catch (e) {
    console.warn(`Failed to add rcov.track(): ${(e as Error).message + "\n" + (e as Error).stack}`);
    return node;
  }
}

function getDefinedOriginal<T extends ts.Node>(node: T): T | undefined {
  if (node.original === undefined) return;
  return getDefinedOriginal(node.original as T) ?? node.original as T;
}

function visitExpression(context: TransformContext, node: ts.Expression): ts.Expression {
  // This can be used to transform expressions
  // For example, a call expression for macros.

  // return context.transform(node);
  return node;
}

function visitBlock(context: TransformContext, node: ts.Block): ts.Block {
  return context.factory.updateBlock(node, node.statements.map(s => visitStatement(context, s)).flat());
}

function visitFunctionLikeDeclaration(context: TransformContext, node: ts.FunctionLikeDeclaration): ts.FunctionLikeDeclaration {
  const { factory } = context;
  let newBody = node.body as ts.Block | undefined;
  if (node.body !== undefined)
    if (ts.isBlock(node.body))
      newBody = visitNode(context, node.body) as ts.Block;
    else if (ts.isExpression(node.body)) {
      const expressionStatement = factory.createExpressionStatement(node.body);
      const block = factory.createBlock([expressionStatement]);
      expressionStatement.original = node.body;
      block.original = node.body;
      newBody = visitNode(context, block) as ts.Block;
    }

  if (node.body === newBody)
    return context.transform(node);

  if (ts.isFunctionDeclaration(node))
    return factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, newBody);
  else if (ts.isFunctionExpression(node))
    return factory.updateFunctionExpression(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, newBody!);
  else if (ts.isArrowFunction(node)) {
    return factory.updateArrowFunction(node, node.modifiers, node.typeParameters, node.parameters, node.type, node.equalsGreaterThanToken, newBody!);
  } else if (ts.isMethodDeclaration(node))
    return factory.updateMethodDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.questionToken, node.typeParameters, node.parameters, node.type, newBody);
  else if (ts.isGetAccessorDeclaration(node))
    return factory.updateGetAccessorDeclaration(node, node.modifiers, node.name, node.parameters, node.type, newBody);
  else if (ts.isSetAccessorDeclaration(node))
    return factory.updateSetAccessorDeclaration(node, node.modifiers, node.name, node.parameters, newBody);

  return factory.updateConstructorDeclaration(node, node.modifiers, node.parameters, newBody);
}

function visitNode(context: TransformContext, node: ts.Node): ts.Node | ts.Node[] {
  context.checkSourceFile(node);
  if (ts.isBlock(node))
    return visitBlock(context, node);
  else if (ts.isFunctionLikeDeclaration(node))
    return visitFunctionLikeDeclaration(context, node);
  else if (ts.isStatement(node))
    return visitStatement(context, node);
  else if (ts.isExpression(node))
    return visitExpression(context, node)

  // We encountered a node that we don't handle above,
  // but we should keep iterating the AST in case we find something we want to transform.
  return context.transform(node);
}
