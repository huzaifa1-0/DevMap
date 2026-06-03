import * as parser from '@babel/parser';
import traverse from '@babel/traverse';

/**
 * Scans a given block of JS/TS code and returns a Set of detected topic IDs.
 */
export function scanCodeForTopics(code: string, filepath: string): Set<string> {
  const matchedTopics = new Set<string>();

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
      VariableDeclaration() {
        matchedTopics.add('variables_scope');
      },

      ArrowFunctionExpression(path) {
        matchedTopics.add('arrow_fn');
        
        // Check for express req/res parameters
        const params = path.node.params;
        if (params.length === 4) {
          matchedTopics.add('express_error_middleware');
        }
        params.forEach(param => {
          if (param.type === 'Identifier') {
            if (param.name === 'req' || param.name === 'request') {
              matchedTopics.add('express_req_obj');
            }
            if (param.name === 'res' || param.name === 'response') {
              matchedTopics.add('express_res_obj');
            }
          }
        });
      },

      FunctionDeclaration(path) {
        if (path.node.async) {
          matchedTopics.add('async_await');
        }
        if (path.node.generator) {
          matchedTopics.add('generators');
        }

        // Check for express req/res parameters
        const params = path.node.params;
        if (params.length === 4) {
          matchedTopics.add('express_error_middleware');
        }
        params.forEach(param => {
          if (param.type === 'Identifier') {
            if (param.name === 'req' || param.name === 'request') {
              matchedTopics.add('express_req_obj');
            }
            if (param.name === 'res' || param.name === 'response') {
              matchedTopics.add('express_res_obj');
            }
          }
        });
      },

      FunctionExpression(path) {
        if (path.node.async) {
          matchedTopics.add('async_await');
        }
        if (path.node.generator) {
          matchedTopics.add('generators');
        }

        // Check for express req/res parameters
        const params = path.node.params;
        if (params.length === 4) {
          matchedTopics.add('express_error_middleware');
        }
        params.forEach(param => {
          if (param.type === 'Identifier') {
            if (param.name === 'req' || param.name === 'request') {
              matchedTopics.add('express_req_obj');
            }
            if (param.name === 'res' || param.name === 'response') {
              matchedTopics.add('express_res_obj');
            }
          }
        });
      },

      ObjectPattern() {
        matchedTopics.add('destructuring');
      },

      ArrayPattern() {
        matchedTopics.add('destructuring');
      },

      SpreadElement() {
        matchedTopics.add('spread_rest');
      },

      RestElement() {
        matchedTopics.add('spread_rest');
      },

      TemplateLiteral() {
        matchedTopics.add('template_literals');
      },

      TryStatement() {
        matchedTopics.add('error_handling');
      },

      ClassDeclaration() {
        matchedTopics.add('classes');
      },

      ClassExpression() {
        matchedTopics.add('classes');
      },

      AwaitExpression() {
        matchedTopics.add('async_await');
      },

      DebuggerStatement() {
        matchedTopics.add('debugging');
      },

      ImportDeclaration(path) {
        matchedTopics.add('es_modules');
        const sourceVal = path.node.source.value;
        if (sourceVal === 'fs' || sourceVal === 'fs/promises' || sourceVal.startsWith('node:fs')) {
          matchedTopics.add('fs_module');
        } else if (sourceVal === 'path' || sourceVal.startsWith('node:path')) {
          matchedTopics.add('path_module');
        } else if (sourceVal === 'stream' || sourceVal.startsWith('node:stream')) {
          matchedTopics.add('streams');
        } else if (sourceVal === 'events' || sourceVal.startsWith('node:events')) {
          matchedTopics.add('event_emitter');
        } else if (sourceVal === 'http' || sourceVal.startsWith('node:http')) {
          matchedTopics.add('http_module');
        } else if (sourceVal === 'child_process' || sourceVal.startsWith('node:child_process')) {
          matchedTopics.add('child_process');
        } else if (sourceVal === 'express') {
          matchedTopics.add('express_setup');
        } else if (sourceVal === 'cors') {
          matchedTopics.add('express_cors');
        }
      },

      NewExpression(path) {
        const { callee } = path.node;
        if (callee.type === 'Identifier') {
          if (callee.name === 'Promise') {
            matchedTopics.add('promises');
          } else if (callee.name === 'EventEmitter') {
            matchedTopics.add('event_emitter');
          }
        }
      },

      CallExpression(path) {
        const { callee, arguments: args } = path.node;

        // CommonJS require and core modules
        if (callee.type === 'Identifier' && callee.name === 'require') {
          matchedTopics.add('commonjs');
          if (args.length > 0 && args[0].type === 'StringLiteral') {
            const reqVal = args[0].value;
            if (reqVal === 'fs' || reqVal === 'fs/promises' || reqVal.startsWith('node:fs')) {
              matchedTopics.add('fs_module');
            } else if (reqVal === 'path' || reqVal.startsWith('node:path')) {
              matchedTopics.add('path_module');
            } else if (reqVal === 'stream' || reqVal.startsWith('node:stream')) {
              matchedTopics.add('streams');
            } else if (reqVal === 'events' || reqVal.startsWith('node:events')) {
              matchedTopics.add('event_emitter');
            } else if (reqVal === 'http' || reqVal.startsWith('node:http')) {
              matchedTopics.add('http_module');
            } else if (reqVal === 'child_process' || reqVal.startsWith('node:child_process')) {
              matchedTopics.add('child_process');
            } else if (reqVal === 'express') {
              matchedTopics.add('express_setup');
            } else if (reqVal === 'cors') {
              matchedTopics.add('express_cors');
            }
          }
        }

        // Express app() call
        if (callee.type === 'Identifier' && callee.name === 'express') {
          matchedTopics.add('express_setup');
        }

        // Member expressions e.g. console.log(), array.map(), res.send()
        if (callee.type === 'MemberExpression') {
          const prop = callee.property;
          const obj = callee.object;

          if (prop.type === 'Identifier') {
            // Promise .then / .catch
            if (prop.name === 'then' || prop.name === 'catch') {
              matchedTopics.add('promises');
            }
            // Streams .pipe
            if (prop.name === 'pipe') {
              matchedTopics.add('streams');
            }
            // Array methods
            if (['map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every'].includes(prop.name)) {
              matchedTopics.add('array_methods');
            }
            // Express Router
            if (prop.name === 'Router' && obj.type === 'Identifier' && obj.name === 'express') {
              matchedTopics.add('express_router_mod');
            }
            // Express body parsing: express.json(), express.urlencoded(), bodyParser.json()
            if (['json', 'urlencoded'].includes(prop.name)) {
              if (obj.type === 'Identifier' && (obj.name === 'express' || obj.name === 'bodyParser' || obj.name.toLowerCase().includes('bodyparser'))) {
                matchedTopics.add('express_body_parsing');
              }
            }
            // Express static
            if (prop.name === 'static' && obj.type === 'Identifier' && obj.name === 'express') {
              matchedTopics.add('express_static');
            }
            // Routing and middleware
            if (['get', 'post', 'put', 'delete', 'use'].includes(prop.name)) {
              // Usually called on an object named app, router, etc.
              if (obj.type === 'Identifier' && (obj.name === 'app' || obj.name === 'router' || obj.name === 'api' || obj.name === 'server')) {
                if (prop.name === 'use') {
                  matchedTopics.add('express_middleware');
                } else {
                  matchedTopics.add('express_routing');
                }
              }
            }
          }
        }
      },

      Identifier(path) {
        const name = path.node.name;
        if (name === 'process') {
          matchedTopics.add('process_object');
        } else if (name === 'Buffer') {
          matchedTopics.add('buffers');
        }
      },

      MemberExpression(path) {
        const obj = path.node.object;
        const prop = path.node.property;

        if (obj.type === 'Identifier' && obj.name === 'process' && prop.type === 'Identifier' && prop.name === 'env') {
          matchedTopics.add('env_variables');
        }

        // Check for request/response usage e.g. req.body, res.send
        if (obj.type === 'Identifier') {
          if (obj.name === 'req' || obj.name === 'request') {
            matchedTopics.add('express_req_obj');
          }
          if (obj.name === 'res' || obj.name === 'response') {
            matchedTopics.add('express_res_obj');
          }
        }
      }
    });
  } catch (error) {
    console.error('Error parsing AST for file:', filepath, error);
  }

  return matchedTopics;
}
