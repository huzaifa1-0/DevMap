import * as parser from '@babel/parser';
import traverse from '@babel/traverse';

/**
 * Extracts the exact code snippet for a given AST node.
 */
function extractSnippet(code: string, node: any): string {
  if (node && node.loc) {
    const startLine = node.loc.start.line;
    const endLine = node.loc.end.line;
    const lines = code.split('\n');
    const matchedLines = lines.slice(startLine - 1, endLine);
    if (matchedLines.length > 25) {
      return matchedLines.slice(0, 25).join('\n') + '\n... [truncated]';
    }
    return matchedLines.join('\n');
  }
  return '';
}

/**
 * Scans a given block of JS/TS code and returns a Map of detected topic IDs to their code snippets.
 */
export function scanCodeForTopics(code: string, filepath: string): Map<string, string> {
  const matchedTopics = new Map<string, string>();

  const addMatch = (topicId: string, node: any) => {
    if (!matchedTopics.has(topicId)) {
      matchedTopics.set(topicId, extractSnippet(code, node));
    }
  };

  // Detect file type for parser plugins
  const isTypeScript = filepath.endsWith('.ts') || filepath.endsWith('.tsx');
  const isJSX = filepath.endsWith('.jsx') || filepath.endsWith('.tsx');

  const plugins: parser.ParserPlugin[] = [];
  if (isTypeScript) {
    plugins.push('typescript');
  }
  if (isJSX) {
    plugins.push('jsx');
  }
  plugins.push('decorators-legacy');

  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      plugins,
      errorRecovery: true // recover from syntax errors so we still scan what we can
    });

    traverse(ast, {
      VariableDeclaration(path) {
        addMatch('variables_scope', path.node);
      },

      ArrowFunctionExpression(path) {
        addMatch('arrow_fn', path.node);
        
        // Check for express req/res parameters
        const params = path.node.params;
        if (params.length === 4) {
          addMatch('express_error_middleware', path.node);
        }
        params.forEach(param => {
          if (param.type === 'Identifier') {
            if (param.name === 'req' || param.name === 'request') {
              addMatch('express_req_obj', path.node);
            }
            if (param.name === 'res' || param.name === 'response') {
              addMatch('express_res_obj', path.node);
            }
          }
        });
      },

      FunctionDeclaration(path) {
        if (path.node.async) {
          addMatch('async_await', path.node);
        }
        if (path.node.generator) {
          addMatch('generators', path.node);
        }

        // Check for express req/res parameters
        const params = path.node.params;
        if (params.length === 4) {
          addMatch('express_error_middleware', path.node);
        }
        params.forEach(param => {
          if (param.type === 'Identifier') {
            if (param.name === 'req' || param.name === 'request') {
              addMatch('express_req_obj', path.node);
            }
            if (param.name === 'res' || param.name === 'response') {
              addMatch('express_res_obj', path.node);
            }
          }
        });
      },

      FunctionExpression(path) {
        if (path.node.async) {
          addMatch('async_await', path.node);
        }
        if (path.node.generator) {
          addMatch('generators', path.node);
        }

        // Check for express req/res parameters
        const params = path.node.params;
        if (params.length === 4) {
          addMatch('express_error_middleware', path.node);
        }
        params.forEach(param => {
          if (param.type === 'Identifier') {
            if (param.name === 'req' || param.name === 'request') {
              addMatch('express_req_obj', path.node);
            }
            if (param.name === 'res' || param.name === 'response') {
              addMatch('express_res_obj', path.node);
            }
          }
        });
      },

      ObjectPattern(path) {
        addMatch('destructuring', path.node);
      },

      ArrayPattern(path) {
        addMatch('destructuring', path.node);
      },

      SpreadElement(path) {
        addMatch('spread_rest', path.node);
      },

      RestElement(path) {
        addMatch('spread_rest', path.node);
      },

      TemplateLiteral(path) {
        addMatch('template_literals', path.node);
      },

      TryStatement(path) {
        addMatch('error_handling', path.node);
      },

      ClassDeclaration(path) {
        addMatch('classes', path.node);
      },

      ClassExpression(path) {
        addMatch('classes', path.node);
      },

      AwaitExpression(path) {
        addMatch('async_await', path.node);
      },

      DebuggerStatement(path) {
        addMatch('debugging', path.node);
      },

      ImportDeclaration(path) {
        addMatch('es_modules', path.node);
        const sourceVal = path.node.source.value;
        if (sourceVal === 'fs' || sourceVal === 'fs/promises' || sourceVal.startsWith('node:fs')) {
          addMatch('fs_module', path.node);
        } else if (sourceVal === 'path' || sourceVal.startsWith('node:path')) {
          addMatch('path_module', path.node);
        } else if (sourceVal === 'stream' || sourceVal.startsWith('node:stream')) {
          addMatch('streams', path.node);
        } else if (sourceVal === 'events' || sourceVal.startsWith('node:events')) {
          addMatch('event_emitter', path.node);
        } else if (sourceVal === 'http' || sourceVal.startsWith('node:http')) {
          addMatch('http_module', path.node);
        } else if (sourceVal === 'child_process' || sourceVal.startsWith('node:child_process')) {
          addMatch('child_process', path.node);
        } else if (sourceVal === 'express') {
          addMatch('express_setup', path.node);
        } else if (sourceVal === 'cors') {
          addMatch('express_cors', path.node);
        }
      },

      NewExpression(path) {
        const { callee } = path.node;
        if (callee.type === 'Identifier') {
          if (callee.name === 'Promise') {
            addMatch('promises', path.node);
          } else if (callee.name === 'EventEmitter') {
            addMatch('event_emitter', path.node);
          }
        }
      },

      CallExpression(path) {
        const { callee, arguments: args } = path.node;

        // CommonJS require and core modules
        if (callee.type === 'Identifier' && callee.name === 'require') {
          addMatch('commonjs', path.node);
          if (args.length > 0 && args[0].type === 'StringLiteral') {
            const reqVal = args[0].value;
            if (reqVal === 'fs' || reqVal === 'fs/promises' || reqVal.startsWith('node:fs')) {
              addMatch('fs_module', path.node);
            } else if (reqVal === 'path' || reqVal.startsWith('node:path')) {
              addMatch('path_module', path.node);
            } else if (reqVal === 'stream' || reqVal.startsWith('node:stream')) {
              addMatch('streams', path.node);
            } else if (reqVal === 'events' || reqVal.startsWith('node:events')) {
              addMatch('event_emitter', path.node);
            } else if (reqVal === 'http' || reqVal.startsWith('node:http')) {
              addMatch('http_module', path.node);
            } else if (reqVal === 'child_process' || reqVal.startsWith('node:child_process')) {
              addMatch('child_process', path.node);
            } else if (reqVal === 'express') {
              addMatch('express_setup', path.node);
            } else if (reqVal === 'cors') {
              addMatch('express_cors', path.node);
            }
          }
        }

        // Express app() call
        if (callee.type === 'Identifier' && callee.name === 'express') {
          addMatch('express_setup', path.node);
        }

        // Member expressions e.g. console.log(), array.map(), res.send()
        if (callee.type === 'MemberExpression') {
          const prop = callee.property;
          const obj = callee.object;

          if (prop.type === 'Identifier') {
            // Promise .then / .catch
            if (prop.name === 'then' || prop.name === 'catch') {
              addMatch('promises', path.node);
            }
            // Streams .pipe
            if (prop.name === 'pipe') {
              addMatch('streams', path.node);
            }
            // Array methods
            if (['map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every'].includes(prop.name)) {
              addMatch('array_methods', path.node);
            }
            // Express Router
            if (prop.name === 'Router' && obj.type === 'Identifier' && obj.name === 'express') {
              addMatch('express_router_mod', path.node);
            }
            // Express body parsing: express.json(), express.urlencoded(), bodyParser.json()
            if (['json', 'urlencoded'].includes(prop.name)) {
              if (obj.type === 'Identifier' && (obj.name === 'express' || obj.name === 'bodyParser' || obj.name.toLowerCase().includes('bodyparser'))) {
                addMatch('express_body_parsing', path.node);
              }
            }
            // Express static
            if (prop.name === 'static' && obj.type === 'Identifier' && obj.name === 'express') {
              addMatch('express_static', path.node);
            }
            // Routing and middleware
            if (['get', 'post', 'put', 'delete', 'use'].includes(prop.name)) {
              // Usually called on an object named app, router, etc.
              if (obj.type === 'Identifier' && (obj.name === 'app' || obj.name === 'router' || obj.name === 'api' || obj.name === 'server')) {
                if (prop.name === 'use') {
                  addMatch('express_middleware', path.node);
                } else {
                  addMatch('express_routing', path.node);
                }
              }
            }
          }
        }
      },

      Identifier(path) {
        const name = path.node.name;
        if (name === 'process') {
          addMatch('process_object', path.node);
        } else if (name === 'Buffer') {
          addMatch('buffers', path.node);
        }
      },

      MemberExpression(path) {
        const obj = path.node.object;
        const prop = path.node.property;

        if (obj.type === 'Identifier' && obj.name === 'process' && prop.type === 'Identifier' && prop.name === 'env') {
          addMatch('env_variables', path.node);
        }

        // Check for request/response usage e.g. req.body, res.send
        if (obj.type === 'Identifier') {
          if (obj.name === 'req' || obj.name === 'request') {
            addMatch('express_req_obj', path.node);
          }
          if (obj.name === 'res' || obj.name === 'response') {
            addMatch('express_res_obj', path.node);
          }
        }
      }
    });
  } catch (error) {
    console.error('Error parsing AST for file:', filepath, error);
  }

  return matchedTopics;
}

