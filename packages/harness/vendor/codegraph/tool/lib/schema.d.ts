/**
 * The `codegraph` tool's model-facing schemas: the parameter spec the model fills in and the
 * canonical output union each operation returns.
 *
 * The output is a closed `oneOf` keyed on `operation`, not one loose object with every field
 * optional, so a Code Mode program that switches on `operation` gets exactly the fields that
 * operation produces and nothing it must test for. Members are built from shared field groups
 * because ten hand-written copies of a symbol projection would drift apart.
 * @module dsh-plugin-codegraph-tool/schema
 */
import type { InferArgs, InferValue } from '@deepseek-ai/dsh-tools';
/** Every operation the tool family exposes, across both the query tool and the dedicated index tool. */
export declare const CODEGRAPH_OPERATIONS: readonly ["search", "node", "callers", "callees", "impact", "trace", "files", "status", "explore", "context", "index"];
/** One operation name. */
export type CodegraphToolOperation = (typeof CODEGRAPH_OPERATIONS)[number];
/** The canonical value every `codegraph` call returns, discriminated by `operation`. */
export declare const CODEGRAPH_OUTPUT_SCHEMA: {
    readonly oneOf: readonly [{
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly operation: {
                readonly type: "string";
                readonly required: true;
                readonly const: "search";
            };
            readonly project_path: {
                readonly type: "string";
                readonly required: true;
            };
        } & {
            readonly total: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly truncated: {
                readonly type: "boolean";
                readonly required: true;
            };
            readonly symbols: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                };
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly operation: {
                readonly type: "string";
                readonly required: true;
                readonly const: "node";
            };
            readonly project_path: {
                readonly type: "string";
                readonly required: true;
            };
        } & {
            readonly symbol: {
                readonly required: true;
                readonly oneOf: readonly [{
                    readonly type: "null";
                }, {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                }];
            };
            readonly incoming: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly via: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly site_line: {
                            readonly type: "integer";
                        };
                        readonly site_count: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                };
            };
            readonly outgoing: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly via: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly site_line: {
                            readonly type: "integer";
                        };
                        readonly site_count: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                };
            };
            readonly alternatives: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                };
            };
            readonly code: {
                readonly required: true;
                readonly oneOf: readonly [{
                    readonly type: "null";
                }, {
                    readonly type: "string";
                }];
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly operation: {
                readonly type: "string";
                readonly required: true;
                readonly const: "callers";
            };
            readonly project_path: {
                readonly type: "string";
                readonly required: true;
            };
        } & {
            readonly total: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly truncated: {
                readonly type: "boolean";
                readonly required: true;
            };
            readonly symbol: {
                readonly required: true;
                readonly oneOf: readonly [{
                    readonly type: "null";
                }, {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                }];
            };
            readonly relations: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly via: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly site_line: {
                            readonly type: "integer";
                        };
                        readonly site_count: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                };
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly operation: {
                readonly type: "string";
                readonly required: true;
                readonly const: "callees";
            };
            readonly project_path: {
                readonly type: "string";
                readonly required: true;
            };
        } & {
            readonly total: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly truncated: {
                readonly type: "boolean";
                readonly required: true;
            };
            readonly symbol: {
                readonly required: true;
                readonly oneOf: readonly [{
                    readonly type: "null";
                }, {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                }];
            };
            readonly relations: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly via: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly site_line: {
                            readonly type: "integer";
                        };
                        readonly site_count: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                };
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly operation: {
                readonly type: "string";
                readonly required: true;
                readonly const: "impact";
            };
            readonly project_path: {
                readonly type: "string";
                readonly required: true;
            };
        } & {
            readonly total: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly truncated: {
                readonly type: "boolean";
                readonly required: true;
            };
            readonly symbol: {
                readonly required: true;
                readonly oneOf: readonly [{
                    readonly type: "null";
                }, {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                }];
            };
            readonly affected: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly via: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly distance: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                };
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly operation: {
                readonly type: "string";
                readonly required: true;
                readonly const: "trace";
            };
            readonly project_path: {
                readonly type: "string";
                readonly required: true;
            };
        } & {
            readonly from: {
                readonly required: true;
                readonly oneOf: readonly [{
                    readonly type: "null";
                }, {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                }];
            };
            readonly to: {
                readonly required: true;
                readonly oneOf: readonly [{
                    readonly type: "null";
                }, {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                }];
            };
            readonly paths: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly via: {
                                readonly type: "string";
                            };
                            readonly site_line: {
                                readonly type: "integer";
                            };
                            readonly name: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly qualified_name: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly kind: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly path: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly line: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly end_line: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly language: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly exported: {
                                readonly type: "boolean";
                                readonly required: true;
                            };
                            readonly signature: {
                                readonly type: "string";
                            };
                            readonly docstring: {
                                readonly type: "string";
                            };
                        };
                    };
                };
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly operation: {
                readonly type: "string";
                readonly required: true;
                readonly const: "files";
            };
            readonly project_path: {
                readonly type: "string";
                readonly required: true;
            };
        } & {
            readonly total: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly truncated: {
                readonly type: "boolean";
                readonly required: true;
            };
            readonly files: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly size: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly symbol_count: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                    };
                };
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly operation: {
                readonly type: "string";
                readonly required: true;
                readonly const: "status";
            };
            readonly project_path: {
                readonly type: "string";
                readonly required: true;
            };
        } & {
            readonly indexed: {
                readonly type: "boolean";
                readonly required: true;
            };
            readonly file_count: {
                readonly type: "integer";
            };
            readonly symbol_count: {
                readonly type: "integer";
            };
            readonly edge_count: {
                readonly type: "integer";
            };
            readonly format_version: {
                readonly type: "integer";
            };
            readonly indexed_at: {
                readonly oneOf: readonly [{
                    readonly type: "null";
                }, {
                    readonly type: "integer";
                }];
            };
            readonly languages: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly file_count: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                    };
                };
            };
            readonly stale_file_count: {
                readonly type: "integer";
            };
            readonly stale_file_count_truncated: {
                readonly type: "boolean";
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly operation: {
                readonly type: "string";
                readonly required: true;
                readonly const: "explore";
            };
            readonly project_path: {
                readonly type: "string";
                readonly required: true;
            };
        } & {
            readonly total: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly truncated: {
                readonly type: "boolean";
                readonly required: true;
            };
            readonly files: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly symbols: {
                            readonly type: "array";
                            readonly required: true;
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly name: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly qualified_name: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly kind: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly path: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly line: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly end_line: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly language: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly exported: {
                                        readonly type: "boolean";
                                        readonly required: true;
                                    };
                                    readonly signature: {
                                        readonly type: "string";
                                    };
                                    readonly docstring: {
                                        readonly type: "string";
                                    };
                                };
                            };
                        };
                        readonly code: {
                            readonly required: true;
                            readonly oneOf: readonly [{
                                readonly type: "null";
                            }, {
                                readonly type: "string";
                            }];
                        };
                        readonly code_start_line: {
                            readonly type: "integer";
                        };
                        readonly truncated: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                    };
                };
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly operation: {
                readonly type: "string";
                readonly required: true;
                readonly const: "context";
            };
            readonly project_path: {
                readonly type: "string";
                readonly required: true;
            };
        } & {
            readonly task: {
                readonly type: "string";
                readonly required: true;
            };
            readonly entry_points: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                };
            };
            readonly related: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly via: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly site_line: {
                            readonly type: "integer";
                        };
                        readonly site_count: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly qualified_name: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exported: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly signature: {
                            readonly type: "string";
                        };
                        readonly docstring: {
                            readonly type: "string";
                        };
                    };
                };
            };
            readonly files: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly path: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly symbols: {
                            readonly type: "array";
                            readonly required: true;
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly name: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly qualified_name: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly kind: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly path: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly line: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly end_line: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly language: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly exported: {
                                        readonly type: "boolean";
                                        readonly required: true;
                                    };
                                    readonly signature: {
                                        readonly type: "string";
                                    };
                                    readonly docstring: {
                                        readonly type: "string";
                                    };
                                };
                            };
                        };
                        readonly code: {
                            readonly required: true;
                            readonly oneOf: readonly [{
                                readonly type: "null";
                            }, {
                                readonly type: "string";
                            }];
                        };
                        readonly code_start_line: {
                            readonly type: "integer";
                        };
                        readonly truncated: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                    };
                };
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly operation: {
                readonly type: "string";
                readonly required: true;
                readonly const: "index";
            };
            readonly project_path: {
                readonly type: "string";
                readonly required: true;
            };
        } & {
            readonly files_indexed: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly files_skipped: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly symbol_count: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly edge_count: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly unresolved_count: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly unresolved_likely_internal_count: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly languages: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly language: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly file_count: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                    };
                };
            };
        };
    }];
};
/** The parameters the model fills in. Which ones apply depends on `operation`. */
export declare const CODEGRAPH_PARAMETERS: {
    readonly operation: {
        readonly type: "string";
        readonly required: true;
        readonly enum: readonly ["search", "node", "callers", "callees", "impact", "trace", "files", "status", "explore", "context"];
        readonly description: "search (find declarations by name), node (one symbol with its callers and callees), callers, callees, impact (what a change reaches), trace (call path from one symbol to another), files (indexed file list), status (index size and freshness), explore (several related symbols with their source), context (everything relevant to a task). To build or refresh the index itself, call the codegraph_index tool instead.";
    };
    readonly symbol: {
        readonly type: "string";
        readonly description: "The symbol name for node, callers, callees, and impact. Simple or qualified.";
    };
    readonly query: {
        readonly type: "string";
        readonly description: "The search text for search and explore. Matches names, qualified names, signatures, and documentation.";
    };
    readonly task: {
        readonly type: "string";
        readonly description: "The task, bug, or feature to gather context for. Required by context.";
    };
    readonly from: {
        readonly type: "string";
        readonly description: "The symbol a traced flow starts at. Required by trace.";
    };
    readonly to: {
        readonly type: "string";
        readonly description: "The symbol a traced flow should reach. Required by trace.";
    };
    readonly path: {
        readonly type: "string";
        readonly description: "Restrict files to this directory, relative to the project root.";
    };
    readonly pattern: {
        readonly type: "string";
        readonly description: "Restrict files to paths matching this glob, e.g. src/pages/*.tsx.";
    };
    readonly kind: {
        readonly type: "string";
        readonly description: "Restrict search to one declaration kind, e.g. function, class, interface.";
    };
    readonly language: {
        readonly type: "string";
        readonly description: "Restrict search to one language, e.g. typescript, python, go.";
    };
    readonly limit: {
        readonly type: "number";
        readonly description: "Largest number of results to return.";
    };
    readonly depth: {
        readonly type: "number";
        readonly description: "Hops to traverse for impact and trace.";
    };
    readonly include_code: {
        readonly type: "boolean";
        readonly description: "Include source text for node. explore and context always include it.";
    };
    readonly project_path: {
        readonly type: "string";
        readonly description: "Absolute path of another indexed project to query. Defaults to this session's workspace.";
    };
};
/**
 * The parameters the dedicated `codegraph_index` tool takes: only the project to (re)index. It
 * needs no `operation` — building the index is the only thing this tool does — and none of the
 * query-side fields (`symbol`, `query`, `limit`, …), which an index run has no use for.
 */
export declare const CODEGRAPH_INDEX_PARAMETERS: {
    readonly project_path: {
        readonly type: "string";
        readonly description: "Absolute path of the project to index. Defaults to this session's workspace.";
    };
};
/** The canonical value, inferred from {@link CODEGRAPH_OUTPUT_SCHEMA} so the two cannot drift. */
export type CodegraphToolValue = InferValue<typeof CODEGRAPH_OUTPUT_SCHEMA>;
/** The validated arguments, inferred from {@link CODEGRAPH_PARAMETERS}. */
export type CodegraphToolArgs = InferArgs<typeof CODEGRAPH_PARAMETERS>;
/** The validated arguments, inferred from {@link CODEGRAPH_INDEX_PARAMETERS}. */
export type CodegraphIndexToolArgs = InferArgs<typeof CODEGRAPH_INDEX_PARAMETERS>;
/** The canonical value for one operation. */
export type CodegraphValueFor<O extends CodegraphToolOperation> = Extract<CodegraphToolValue, {
    operation: O;
}>;
//# sourceMappingURL=schema.d.ts.map