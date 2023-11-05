"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCacheKey = exports.transform = void 0;
/**
 * Copyright 2023-present 650 Industries (Expo). All rights reserved.
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Fork of the Metro transformer worker, but with speed optimizations.
 * https://github.com/facebook/metro/blob/1fb04dea1982e73c1c1d25db0db81b2088a45bfc/packages/metro-transform-worker/src/index.js
 */
const core_1 = require("@babel/core");
const generator_1 = __importDefault(require("@babel/generator"));
const babylon = __importStar(require("@babel/parser"));
const types = __importStar(require("@babel/types"));
const metro_cache_1 = require("metro-cache");
// @ts-expect-error
const metro_cache_key_1 = __importDefault(require("metro-cache-key"));
const metro_source_map_1 = require("metro-source-map");
const metro_transform_plugins_1 = __importDefault(require("metro-transform-plugins"));
const getMinifier_1 = __importDefault(require("metro-transform-worker/src/utils/getMinifier"));
const countLines_1 = __importDefault(require("metro/src/lib/countLines"));
// @ts-expect-error
const collectDependencies_1 = __importStar(require("metro/src/ModuleGraph/worker/collectDependencies"));
const generateImportNames_1 = __importDefault(require("metro/src/ModuleGraph/worker/generateImportNames"));
const JsFileWrapping_1 = __importDefault(require("metro/src/ModuleGraph/worker/JsFileWrapping"));
// asserts non-null
function nullthrows(x, message) {
    if (x != null) {
        return x;
    }
    var error = new Error(message ?? 'Got unexpected ' + x);
    // @ts-expect-error
    error.framesToPop = 1; // Skip nullthrows's own stack frame.
    throw error;
}
function getDynamicDepsBehavior(inPackages, filename) {
    switch (inPackages) {
        case 'reject':
            return 'reject';
        case 'throwAtRuntime':
            const isPackage = /(?:^|[/\\])node_modules[/\\]/.test(filename);
            return isPackage ? inPackages : 'reject';
        default:
            throw new Error(`invalid value for dynamic deps behavior: \`${inPackages}\``);
    }
}
const minifyCode = async (config, projectRoot, filename, code, source, map, reserved = []) => {
    const sourceMap = (0, metro_source_map_1.fromRawMappings)([
        {
            code,
            source,
            map,
            // functionMap is overridden by the serializer
            functionMap: null,
            path: filename,
            // isIgnored is overriden by the serializer
            isIgnored: false,
        },
    ]).toMap(undefined, {});
    const minify = (0, getMinifier_1.default)(config.minifierPath);
    try {
        const minified = await minify({
            code,
            map: sourceMap,
            filename,
            reserved,
            config: config.minifierConfig,
        });
        return {
            code: minified.code,
            map: minified.map ? (0, metro_source_map_1.toBabelSegments)(minified.map).map(metro_source_map_1.toSegmentTuple) : [],
        };
    }
    catch (error) {
        if (error.constructor.name === 'JS_Parse_Error') {
            throw new Error(`${error.message} in file ${filename} at ${error.line}:${error.col}`);
        }
        throw error;
    }
};
const disabledDependencyTransformer = {
    transformSyncRequire: () => void 0,
    transformImportCall: () => void 0,
    transformPrefetch: () => void 0,
    transformIllegalDynamicRequire: () => void 0,
};
class InvalidRequireCallError extends Error {
    innerError;
    filename;
    constructor(innerError, filename) {
        super(`${filename}:${innerError.message}`);
        this.innerError = innerError;
        this.filename = filename;
    }
}
async function transformJS(file, { config, options, projectRoot }) {
    // Transformers can output null ASTs (if they ignore the file). In that case
    // we need to parse the module source code to get their AST.
    let ast = file.ast ?? babylon.parse(file.code, { sourceType: 'unambiguous' });
    // const early = types.cloneNode(ast);
    const { importDefault, importAll } = (0, generateImportNames_1.default)(ast);
    // Add "use strict" if the file was parsed as a module, and the directive did
    // not exist yet.
    const { directives } = ast.program;
    const treeshaking = options.customTransformOptions?.treeshake === 'true';
    if (ast.program.sourceType === 'module' &&
        directives != null &&
        directives.findIndex((d) => d.value.value === 'use strict') === -1) {
        directives.push(types.directive(types.directiveLiteral('use strict')));
    }
    // Perform the import-export transform (in case it's still needed), then
    // fold requires and perform constant folding (if in dev).
    const plugins = [];
    const babelPluginOpts = {
        ...options,
        inlineableCalls: [importDefault, importAll],
        importDefault,
        importAll,
    };
    if (options.experimentalImportSupport === true) {
        plugins.push([metro_transform_plugins_1.default.importExportPlugin, babelPluginOpts]);
    }
    if (options.inlineRequires) {
        plugins.push([
            require('metro-transform-plugins/src/inline-plugin'),
            // metroTransformPlugins.inlineRequiresPlugin,
            {
                ...babelPluginOpts,
                ignoredRequires: options.nonInlinedRequires,
            },
        ]);
    }
    const minify = options.minify &&
        options.unstable_transformProfile !== 'hermes-canary' &&
        options.unstable_transformProfile !== 'hermes-stable';
    if (minify) {
        plugins.push([metro_transform_plugins_1.default.inlinePlugin, babelPluginOpts]);
    }
    if (plugins.length) {
        ast = nullthrows(
        // @ts-expect-error
        (0, core_1.transformFromAstSync)(ast, '', {
            ast: true,
            babelrc: false,
            code: false,
            configFile: false,
            comments: true,
            filename: file.filename,
            plugins,
            sourceMaps: false,
            // Not-Cloning the input AST here should be safe because other code paths above this call
            // are mutating the AST as well and no code is depending on the original AST.
            // However, switching the flag to false caused issues with ES Modules if `experimentalImportSupport` isn't used https://github.com/facebook/metro/issues/641
            // either because one of the plugins is doing something funky or Babel messes up some caches.
            // Make sure to test the above mentioned case before flipping the flag back to false.
            cloneInputAst: true,
        }).ast);
    }
    if (!options.dev) {
        // Run the constant folding plugin in its own pass, avoiding race conditions
        // with other plugins that have exit() visitors on Program (e.g. the ESM
        // transform).
        ast = nullthrows(
        // @ts-expect-error
        (0, core_1.transformFromAstSync)(ast, '', {
            ast: true,
            babelrc: false,
            code: false,
            configFile: false,
            comments: true,
            filename: file.filename,
            plugins: [[metro_transform_plugins_1.default.constantFoldingPlugin, babelPluginOpts]],
            sourceMaps: false,
            cloneInputAst: false,
        }).ast);
    }
    let dependencyMapName = '';
    let dependencies;
    let wrappedAst;
    // If the module to transform is a script (meaning that is not part of the
    // dependency graph and it code will just be prepended to the bundle modules),
    // we need to wrap it differently than a commonJS module (also, scripts do
    // not have dependencies).
    if (file.type === 'js/script') {
        dependencies = [];
        wrappedAst = JsFileWrapping_1.default.wrapPolyfill(ast);
    }
    else {
        try {
            const opts = {
                asyncRequireModulePath: config.asyncRequireModulePath,
                dependencyTransformer: config.unstable_disableModuleWrapping === true
                    ? disabledDependencyTransformer
                    : undefined,
                dynamicRequires: getDynamicDepsBehavior(config.dynamicDepsInPackages, file.filename),
                inlineableCalls: [importDefault, importAll],
                keepRequireNames: options.dev,
                allowOptionalDependencies: config.allowOptionalDependencies,
                dependencyMapName: config.unstable_dependencyMapReservedName,
                unstable_allowRequireContext: config.unstable_allowRequireContext,
            };
            // @ts-expect-error
            const ii = (0, collectDependencies_1.default)(types.cloneNode(ast), opts);
            dependencies = ii.dependencies;
            dependencyMapName = ii.dependencyMapName;
            // if (!(config.unstable_disableModuleWrapping && file.type === 'js/module' && !minify)) {
            ast = ii.ast;
            // }
            // ({ dependencies, dependencyMapName } = collectDependencies(ast, opts));
        }
        catch (error) {
            if (error instanceof collectDependencies_1.InvalidRequireCallError) {
                throw new InvalidRequireCallError(error, file.filename);
            }
            throw error;
        }
        if (config.unstable_disableModuleWrapping === true) {
            wrappedAst = ast;
        }
        else {
            ({ ast: wrappedAst } = JsFileWrapping_1.default.wrapModule(ast, importDefault, importAll, dependencyMapName, config.globalPrefix));
        }
    }
    const reserved = [];
    if (config.unstable_dependencyMapReservedName != null) {
        reserved.push(config.unstable_dependencyMapReservedName);
    }
    if (minify &&
        file.inputFileSize <= config.optimizationSizeLimit &&
        !config.unstable_disableNormalizePseudoGlobals) {
        reserved.push(...metro_transform_plugins_1.default.normalizePseudoGlobals(wrappedAst, {
            reservedNames: reserved,
        }));
    }
    const result = (0, generator_1.default)(wrappedAst, {
        comments: true,
        compact: config.unstable_compactOutput,
        filename: file.filename,
        retainLines: false,
        sourceFileName: file.filename,
        sourceMaps: true,
    }, file.code);
    // @ts-expect-error: incorrectly typed upstream
    let map = result.rawMappings ? result.rawMappings.map(metro_source_map_1.toSegmentTuple) : [];
    let code = result.code;
    if (minify) {
        ({ map, code } = await minifyCode(config, projectRoot, file.filename, result.code, file.code, map, reserved));
    }
    const output = [
        {
            data: {
                code,
                lineCount: (0, countLines_1.default)(code),
                map,
                functionMap: file.functionMap,
                ...(config.unstable_disableModuleWrapping && file.type === 'js/module' && !minify
                    ? {
                        // ast: babylon.parse(code, { sourceType: 'unambiguous' }),
                        ast: wrappedAst,
                    }
                    : {}),
            },
            type: file.type,
        },
    ];
    return {
        dependencies,
        output,
    };
}
/**
 * Transforms an asset file
 */
async function transformAsset(file, context) {
    const assetTransformer = require('metro-transform-worker/src/utils/assetTransformer');
    const { assetRegistryPath, assetPlugins } = context.config;
    const result = await assetTransformer.transform(getBabelTransformArgs(file, context), assetRegistryPath, assetPlugins);
    const jsFile = {
        ...file,
        type: 'js/module/asset',
        ast: result.ast,
        functionMap: null,
    };
    return transformJS(jsFile, context);
}
/**
 * Transforms a JavaScript file with Babel before processing the file with
 * the generic JavaScript transformation.
 */
async function transformJSWithBabel(file, context) {
    const { babelTransformerPath } = context.config;
    // $FlowFixMe[unsupported-syntax] dynamic require
    const transformer = require(babelTransformerPath);
    const treeshaking = context.options.customTransformOptions?.treeshake === 'true';
    const transformResult = await transformer.transform(
    // functionMapBabelPlugin populates metadata.metro.functionMap
    getBabelTransformArgs(file, context, [!treeshaking && metro_source_map_1.functionMapBabelPlugin].filter(Boolean)));
    const jsFile = {
        ...file,
        ast: transformResult.ast,
        functionMap: 
        // @ts-expect-error: incorrectly typed upstream
        transformResult.metadata?.metro?.functionMap ??
            // Fallback to deprecated explicitly-generated `functionMap`
            transformResult.functionMap ??
            null,
    };
    return await transformJS(jsFile, context);
}
async function transformJSON(file, { options, config, projectRoot }) {
    let code = config.unstable_disableModuleWrapping === true
        ? JsFileWrapping_1.default.jsonToCommonJS(file.code)
        : JsFileWrapping_1.default.wrapJson(file.code, config.globalPrefix);
    let map = [];
    // TODO: When we can reuse transformJS for JSON, we should not derive `minify` separately.
    const minify = options.minify &&
        options.unstable_transformProfile !== 'hermes-canary' &&
        options.unstable_transformProfile !== 'hermes-stable';
    if (minify) {
        ({ map, code } = await minifyCode(config, projectRoot, file.filename, code, file.code, map));
    }
    let jsType;
    if (file.type === 'asset') {
        jsType = 'js/module/asset';
    }
    else if (file.type === 'script') {
        jsType = 'js/script';
    }
    else {
        jsType = 'js/module';
    }
    const output = [
        {
            data: { code, lineCount: (0, countLines_1.default)(code), map, functionMap: null },
            type: jsType,
        },
    ];
    return {
        dependencies: [],
        output,
    };
}
function getBabelTransformArgs(file, { options, config, projectRoot }, plugins = []) {
    const { inlineRequires: _, ...babelTransformerOptions } = options;
    return {
        filename: file.filename,
        options: {
            ...babelTransformerOptions,
            enableBabelRCLookup: config.enableBabelRCLookup,
            enableBabelRuntime: config.enableBabelRuntime,
            hermesParser: config.hermesParser,
            projectRoot,
            publicPath: config.publicPath,
            // @ts-expect-error: incorrectly typed upstream
            globalPrefix: config.globalPrefix,
        },
        plugins,
        src: file.code,
    };
}
async function transform(config, projectRoot, filename, data, options) {
    const context = {
        config,
        projectRoot,
        options,
    };
    const sourceCode = data.toString('utf8');
    const { unstable_dependencyMapReservedName } = config;
    if (unstable_dependencyMapReservedName != null) {
        const position = sourceCode.indexOf(unstable_dependencyMapReservedName);
        if (position > -1) {
            throw new SyntaxError('Source code contains the reserved string `' +
                unstable_dependencyMapReservedName +
                '` at character offset ' +
                position);
        }
    }
    if (filename.endsWith('.json')) {
        const jsonFile = {
            filename,
            inputFileSize: data.length,
            code: sourceCode,
            type: options.type,
        };
        return await transformJSON(jsonFile, context);
    }
    if (options.type === 'asset') {
        const file = {
            filename,
            inputFileSize: data.length,
            code: sourceCode,
            type: options.type,
        };
        return await transformAsset(file, context);
    }
    const file = {
        filename,
        inputFileSize: data.length,
        code: sourceCode,
        type: options.type === 'script' ? 'js/script' : 'js/module',
        functionMap: null,
    };
    return await transformJSWithBabel(file, context);
}
exports.transform = transform;
function getCacheKey(config) {
    const { babelTransformerPath, minifierPath, ...remainingConfig } = config;
    const filesKey = (0, metro_cache_key_1.default)([
        require.resolve(babelTransformerPath),
        require.resolve(minifierPath),
        require.resolve('metro-transform-worker/src/utils/getMinifier'),
        require.resolve('metro-transform-worker/src/utils/assetTransformer'),
        require.resolve('metro/src/ModuleGraph/worker/generateImportNames'),
        require.resolve('metro/src/ModuleGraph/worker/JsFileWrapping'),
        ...metro_transform_plugins_1.default.getTransformPluginCacheKeyFiles(),
    ]);
    const babelTransformer = require(babelTransformerPath);
    return [
        filesKey,
        (0, metro_cache_1.stableHash)(remainingConfig).toString('hex'),
        babelTransformer.getCacheKey ? babelTransformer.getCacheKey() : '',
    ].join('$');
}
exports.getCacheKey = getCacheKey;
// module.exports = {
//   transform,
//   getCacheKey,
// };
