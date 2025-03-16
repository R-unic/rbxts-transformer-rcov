import ts from "typescript";

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
    return ts.visitEachChild(node, (node) => visitNode(this, node), this.context);
  }
}

function visitStatement(context: TransformContext, node: ts.Statement): ts.Statement | ts.Statement[] {
  const { factory } = context;
  const sourceFile = node.getSourceFile();
  if (sourceFile === undefined)
    return node;

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

function visitNode(context: TransformContext, node: ts.Node): ts.Node | ts.Node[] {
  if (ts.isStatement(node))
    return visitStatement(context, node);
  else if (ts.isExpression(node))
    return visitExpression(context, node);

  // We encountered a node that we don't handle above,
  // but we should keep iterating the AST in case we find something we want to transform.
  return context.transform(node);
}