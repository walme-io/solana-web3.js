import { createRpcMessage } from '@solana/rpc-spec-types';

import { createRpc, Rpc } from '../rpc';
import { RpcApi, RpcApiRequestPlan } from '../rpc-api';
import { createJsonRpcResponseTransformer } from '../rpc-shared';
import { RpcTransport, RpcTransportResponse } from '../rpc-transport';

interface TestRpcMethods {
    someMethod(...args: unknown[]): unknown;
}

function createMockResponse<T>(jsonResponse: T): RpcTransportResponse<T> {
    return {
        json: () => Promise.resolve(jsonResponse),
        text: () => Promise.resolve(JSON.stringify(jsonResponse)),
    };
}

describe('JSON-RPC 2.0', () => {
    let makeHttpRequest: RpcTransport;
    let rpc: Rpc<TestRpcMethods>;
    beforeEach(() => {
        makeHttpRequest = jest.fn(
            () =>
                new Promise(_ => {
                    /* never resolve */
                }),
        );
        rpc = createRpc({
            api: {
                // Note the lack of method implementations in the base case.
            } as RpcApi<TestRpcMethods>,
            transport: makeHttpRequest,
        });
    });
    it('sends a request to the transport', () => {
        rpc.someMethod(123).send();
        expect(makeHttpRequest).toHaveBeenCalledWith({
            payload: { ...createRpcMessage('someMethod', [123]), id: expect.any(Number) },
        });
    });
    it('returns results from the transport', async () => {
        expect.assertions(1);
        (makeHttpRequest as jest.Mock).mockResolvedValueOnce(createMockResponse(123));
        const result = await rpc.someMethod().send();
        expect(result).toBe(123);
    });
    it('throws errors from the transport', async () => {
        expect.assertions(1);
        const transportError = new Error('o no');
        (makeHttpRequest as jest.Mock).mockRejectedValueOnce(transportError);
        const sendPromise = rpc.someMethod().send();
        await expect(sendPromise).rejects.toThrow(transportError);
    });
    describe('when calling a method having a concrete implementation', () => {
        let rpc: Rpc<TestRpcMethods>;
        beforeEach(() => {
            rpc = createRpc({
                api: {
                    someMethod(...params: unknown[]): RpcApiRequestPlan<unknown> {
                        return {
                            methodName: 'someMethodAugmented',
                            params: [...params, 'augmented', 'params'],
                        };
                    },
                } as RpcApi<TestRpcMethods>,
                transport: makeHttpRequest,
            });
        });
        it('converts the returned request to a JSON-RPC 2.0 message and sends it to the transport', () => {
            rpc.someMethod(123).send();
            expect(makeHttpRequest).toHaveBeenCalledWith({
                payload: {
                    ...createRpcMessage('someMethodAugmented', [123, 'augmented', 'params']),
                    id: expect.any(Number),
                },
            });
        });
    });
    describe('when calling a method whose concrete implementation provides a `toPayload` function', () => {
        let toPayload: jest.Mock;
        let rpc: Rpc<TestRpcMethods>;
        beforeEach(() => {
            toPayload = jest.fn((methodName: string, params: unknown) => ({
                myMethodName: methodName,
                myParams: params,
                processed: true,
            }));
            rpc = createRpc({
                api: {
                    someMethod(...params: unknown[]): RpcApiRequestPlan<unknown> {
                        return {
                            methodName: 'someMethod',
                            params,
                            toPayload,
                        };
                    },
                } as RpcApi<TestRpcMethods>,
                transport: makeHttpRequest,
            });
        });
        it('calls the `toPayload` function using the provided method name and parameters', async () => {
            expect.assertions(1);
            (makeHttpRequest as jest.Mock).mockResolvedValueOnce(createMockResponse({ ok: true }));
            await rpc.someMethod(123).send();
            expect(toPayload).toHaveBeenCalledWith('someMethod', [123]);
        });
        it('passes the result of the `toPayload` function to the RPC transport', async () => {
            expect.assertions(1);
            (makeHttpRequest as jest.Mock).mockResolvedValueOnce(createMockResponse({ ok: true }));
            await rpc.someMethod(123).send();
            expect(makeHttpRequest).toHaveBeenCalledWith({
                payload: {
                    myMethodName: 'someMethod',
                    myParams: [123],
                    processed: true,
                },
            });
        });
    });
    describe('when calling a method whose concrete implementation provides a `toText` function', () => {
        let toText: jest.Mock;
        let rpc: Rpc<TestRpcMethods>;
        beforeEach(() => {
            toText = jest.fn();
            rpc = createRpc({
                api: {
                    someMethod(...params: unknown[]): RpcApiRequestPlan<unknown> {
                        return {
                            methodName: 'someMethod',
                            params,
                            toText,
                        };
                    },
                } as RpcApi<TestRpcMethods>,
                transport: makeHttpRequest,
            });
        });
        it('passes the `toText` function to the RPC transport', async () => {
            expect.assertions(1);
            (makeHttpRequest as jest.Mock).mockResolvedValueOnce(createMockResponse({ ok: true }));
            await rpc.someMethod(123).send();
            expect(makeHttpRequest).toHaveBeenCalledWith({
                payload: expect.any(Object),
                toText,
            });
        });
    });
    describe('when calling a method whose concrete implementation returns a response processor', () => {
        let responseTransformer: jest.Mock;
        let rpc: Rpc<TestRpcMethods>;
        beforeEach(() => {
            responseTransformer = jest.fn(createJsonRpcResponseTransformer(json => `${json} processed response`));
            rpc = createRpc({
                api: {
                    someMethod(...params: unknown[]): RpcApiRequestPlan<unknown> {
                        return {
                            methodName: 'someMethod',
                            params,
                            responseTransformer,
                        };
                    },
                } as RpcApi<TestRpcMethods>,
                transport: makeHttpRequest,
            });
        });
        it('calls the response transformer with the response from the JSON-RPC 2.0 endpoint', async () => {
            expect.assertions(1);
            const rawResponse = createMockResponse(123);
            (makeHttpRequest as jest.Mock).mockResolvedValueOnce(rawResponse);
            await rpc.someMethod().send();
            expect(responseTransformer).toHaveBeenCalledWith(expect.objectContaining({ json: expect.any(Function) }), {
                methodName: 'someMethod',
                params: [],
            });
        });
        it('returns the processed response', async () => {
            expect.assertions(1);
            (makeHttpRequest as jest.Mock).mockResolvedValueOnce(createMockResponse(123));
            const result = await rpc.someMethod().send();
            expect(result).toBe('123 processed response');
        });
    });
});
