import { TransformContext, TransformerConfig } from "./transformer";
import ts from "typescript";

/**
 * The transformer entry point.
 * This provides access to necessary resources and the user specified configuration.
 */
export default function (program: ts.Program, config: TransformerConfig) {
  return (transformationContext: ts.TransformationContext): ((file: ts.SourceFile) => ts.SourceFile) => {
    const context = new TransformContext(program, transformationContext, config);
    const { factory } = context;
    return file => {
      const transformed = context.transform(file);
      let offset = 1;
      let lastStatement;
      while (true) {
        let caught = false;
        lastStatement = transformed.statements[transformed.statements.length - offset];
        try {
          lastStatement.getEnd();
        } catch (e) {
          if (e instanceof Error && e.message.includes("Debug Failure")) {
            caught = true;
            offset++;
            continue;
          }
          break;
        }

        if (!caught) break;
      }

      const emptyLines = transformed.text.split("\n").filter(line => line.trim() === "");
      const totalLines = file.getLineAndCharacterOfPosition(lastStatement.getEnd()).line - emptyLines.length;
      return factory.updateSourceFile(
        transformed,
        [
          factory.createImportDeclaration(
            undefined,
            factory.createImportClause(false, factory.createIdentifier("rcov"), undefined),
            factory.createStringLiteral("@rbxts/rcov"),
            undefined
          ),
          ...transformed.statements,
          factory.createExpressionStatement(
            factory.createCallExpression(
              factory.createPropertyAccessExpression(
                factory.createIdentifier("rcov"),
                factory.createIdentifier("totalLines"),
              ),
              undefined,
              [
                factory.createStringLiteral(file.fileName),
                factory.createNumericLiteral(totalLines)
              ]
            )
          )
        ]
      );
    }
  };
}
