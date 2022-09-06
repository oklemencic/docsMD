import { glob, IOptions } from 'glob';
import { copyFile, readFile, writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { Templater } from './templater';
import { Parser } from './parser';

export interface GeneratorConfig {
  input: string;
  exclude: string;
  workingDirectory: string|undefined;
  output: string;
  highlight: boolean;
  inline: boolean;
  template?: string;
}

export class Generator {
  private templater: Templater;
  private parser: Parser;

  constructor(private config: GeneratorConfig) {
    this.templater = new Templater(config.template);
    this.parser = new Parser(config);
  }

  public async generate(): Promise<void> {
	  
    let globOptions : IOptions = { ignore: this.config.exclude };
    if (this.config.workingDirectory) {
      globOptions.cwd = this.config.workingDirectory;
    }
    const filenames = glob.sync(this.config.input, globOptions);

    for (let i = 0; i < filenames.length; i++) {
      const markdownFilePath = filenames[i];
      
      await this.process(markdownFilePath, this.config.workingDirectory);
    }
  }

  private async process(markdownFilePath: string, workingDirectory: string|undefined): Promise<void> {
    const fullInputPath = (workingDirectory) ? join(workingDirectory, markdownFilePath) : markdownFilePath;
    let output = this.config.output;
    if (this.config.workingDirectory) {
      output = join(this.config.workingDirectory, output);
    }

    const outputFilepath = this.getOutputFilePath(output, markdownFilePath);

    
    const parseResult = await this.parser.parse(fullInputPath);
    const contentHtml = parseResult.html;
    const filename = basename(fullInputPath).replace('.md', '');
    const html = this.templater.create({ content: contentHtml, filename: filename });
    
    await writeFile(outputFilepath, html);

    const filedirectory = dirname(markdownFilePath);
    const fixedImages = parseResult.referencedImages.map(imagePath => join(filedirectory, imagePath));
    await this.copyImages(fixedImages, workingDirectory, output);
  }


  private getOutputFilePath(outputRoot: string, originalPath: string): string {

    while (originalPath.startsWith("..")) {
      originalPath = originalPath.substr(3);
    }

    const markdownFilename = basename(originalPath);
    const markdownRelativeDirectory = dirname(originalPath);

    let htmlFilename = markdownFilename.replace('.md', '.html');
    if (markdownFilename.toLowerCase() === 'readme.md') {
      htmlFilename = 'index.html';
    }

    const outputDirectory = join(outputRoot, markdownRelativeDirectory);
    if (!existsSync(outputDirectory)) {
      mkdirSync(outputDirectory, { recursive: true });
    }

    const outputFilepath = join(outputDirectory, htmlFilename);
    return outputFilepath;
  }

  private async copyImages(paths: string[], workingDirectory: string|undefined, outputDirectory: string) {
    for (let i = 0; i < paths.length; i++) {
      let path = paths[i];
      let inputPath = (workingDirectory) ? join(workingDirectory, path) : path;
      if (!existsSync(inputPath)) {
        console.warn(`Cannot copy image: '${inputPath}' - file not found`);
        continue;
      }

      const targetPath = join(outputDirectory, path);

      if (!existsSync(targetPath)) {
        await copyFile(path, targetPath);
      }
    }
  }
}
