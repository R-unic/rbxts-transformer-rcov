import { globSync } from "glob";
import ts from "typescript";

import { TransformContext, TransformerConfig } from "./transformer";
import path from "path";

/**
 * The transformer entry point.
 * This provides access to necessary resources and the user specified configuration.
 */
export default function (program: ts.Program, config: TransformerConfig) {
  return (transformationContext: ts.TransformationContext): ((file: ts.SourceFile) => ts.SourceFile) => {
    const context = new TransformContext(program, transformationContext, config);
    const { factory } = context;

    return file => {
      const root = path.normalize(path.dirname(__dirname));
      const ignoredPaths = config.ignoreGlobs !== undefined
        ? globSync(config.ignoreGlobs).map(p => path.normalize(path.relative(root, p)))
        : [];

      const filePath = path.normalize(path.relative(root, path.join(path.normalize(file.path))));
      if (ignoredPaths.includes(filePath) || file.statements.length === 0)
        return file;

      const transformed = context.transform(file);
      const lastStatement = getLastStatement(transformed.statements);
      const emptyLines = transformed.text.split("\n").filter(line => line.trim() === "");
      const totalLines = file.getLineAndCharacterOfPosition(lastStatement.getEnd()).line - emptyLines.length;

      return factory.updateSourceFile(
        transformed,
        [
          createRcovImport(factory),
          ...transformed.statements,
          trackLineCount(factory, file, totalLines)
        ]
      );
    }
  };
}

function createRcovImport(factory: ts.NodeFactory): ts.Statement {
  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(false, factory.createIdentifier("rcov"), undefined),
    factory.createStringLiteral("@rbxts/rcov"),
    undefined
  );
}

function trackLineCount(factory: ts.NodeFactory, file: ts.SourceFile, totalLines: number): ts.Statement {
  return factory.createExpressionStatement(
    factory.createCallExpression(
      factory.createPropertyAccessExpression(
        factory.createIdentifier("rcov"),
        factory.createIdentifier("totalLines")
      ),
      undefined,
      [
        factory.createStringLiteral(file.fileName),
        factory.createNumericLiteral(totalLines)
      ]
    )
  );
}

function getLastStatement(statements: ts.NodeArray<ts.Statement>): ts.Statement {
  let offset = 1;
  let lastStatement;
  while (true) {
    let caught = false;
    lastStatement = statements[statements.length - offset];
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

  return lastStatement;
}
