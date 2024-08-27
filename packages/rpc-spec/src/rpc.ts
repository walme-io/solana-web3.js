import {
    Callable,
    createRpcMessage,
    Flatten,
    OverloadImplementations,
    UnionToIntersection,
} from '@solana/rpc-spec-types';

import { RpcApi, RpcApiRequestPlan } from './rpc-api';
import { RpcResponse } from './rpc-shared';
import { RpcTransport } from './rpc-transport';

export type RpcConfig<TRpcMethods, TRpcTransport extends RpcTransport> = Readonly<{
    api: RpcApi<TRpcMethods>;
    transport: TRpcTransport;
}>;

export type Rpc<TRpcMethods> = {
    [TMethodName in keyof TRpcMethods]: PendingRpcRequestBuilder<OverloadImplementations<TRpcMethods, TMethodName>>;
};

export type PendingRpcRequest<TResponse> = {
    send(options?: RpcSendOptions): Promise<TResponse>;
};

export type RpcSendOptions = Readonly<{
    abortSignal?: AbortSignal;
}>;

type PendingRpcRequestBuilder<TMethodImplementations> = UnionToIntersection<
    Flatten<{
        [P in keyof TMethodImplementations]: PendingRpcRequestReturnTypeMapper<TMethodImplementations[P]>;
    }>
>;

type PendingRpcRequestReturnTypeMapper<TMethodImplementation> =
    // Check that this property of the TRpcMethods interface is, in fact, a function.
    TMethodImplementation extends Callable
        ? (...args: Parameters<TMethodImplementation>) => PendingRpcRequest<ReturnType<TMethodImplementation>>
        : never;

export function createRpc<TRpcMethods, TRpcTransport extends RpcTransport>(
    rpcConfig: RpcConfig<TRpcMethods, TRpcTransport>,
): Rpc<TRpcMethods> {
    return makeProxy(rpcConfig) as Rpc<TRpcMethods>;
}

function makeProxy<TRpcMethods, TRpcTransport extends RpcTransport>(
    rpcConfig: RpcConfig<TRpcMethods, TRpcTransport>,
): Rpc<TRpcMethods> {
    return new Proxy(rpcConfig.api, {
        defineProperty() {
            return false;
        },
        deleteProperty() {
            return false;
        },
        get(target, p, receiver) {
            return function (...rawParams: unknown[]) {
                const methodName = p.toString();
                const createRpcRequest = Reflect.get(target, methodName, receiver);
                const newRequest = createRpcRequest
                    ? createRpcRequest(...rawParams)
                    : { methodName, params: rawParams };
                return createPendingRpcRequest(rpcConfig, newRequest);
            };
        },
    }) as Rpc<TRpcMethods>;
}

function createPendingRpcRequest<TRpcMethods, TRpcTransport extends RpcTransport, TResponse>(
    rpcConfig: RpcConfig<TRpcMethods, TRpcTransport>,
    pendingRequest: RpcApiRequestPlan<TResponse>,
): PendingRpcRequest<TResponse> {
    return {
        async send(options?: RpcSendOptions): Promise<TResponse> {
            const { responseTransformer, ...rawRequest } = pendingRequest;
            const request = Object.freeze({ ...rawRequest });
            const payload = request.toPayload
                ? request.toPayload(request.methodName, request.params)
                : createRpcMessage(request.methodName, request.params);
            const transportResponse = await rpcConfig.transport<TResponse>({
                payload,
                signal: options?.abortSignal,
                toText: request.toText,
            });
            let response: RpcResponse<TResponse> = { json: () => transportResponse.json() };
            const rawResponse: RpcResponse<TResponse> = {
                json: async () => {
                    if (response.fromText) {
                        return response.fromText(await transportResponse.text()) as TResponse;
                    } else {
                        return await transportResponse.json();
                    }
                },
            };
            response = responseTransformer ? responseTransformer(rawResponse, request) : rawResponse;
            return await response.json();
        },
    };
}
