import ts from "typescript";
import transform from ".";

const sourceCode = `
function hello() {
  console.log("Hello, world!");
}

hello();
`.trim();

const result = ts.transpileModule(sourceCode, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
  transformers: { before: [(context) => transform(ts.createProgram({ rootNames: ["."], options: {} }), { _: undefined })(context)] },
});

console.log(result.outputText);