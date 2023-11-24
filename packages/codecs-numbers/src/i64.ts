import { Codec, combineCodec, Decoder, Encoder } from '@solana/codecs-core';

import { NumberCodecConfig } from './common.js';
import { numberDecoderFactory, numberEncoderFactory } from './utils.js';

export const getI64Encoder = (config: NumberCodecConfig = {}): Encoder<number | bigint> =>
    numberEncoderFactory({
        config,
        name: 'i64',
        range: [-BigInt('0x7fffffffffffffff') - 1n, BigInt('0x7fffffffffffffff')],
        set: (view, value, le) => view.setBigInt64(0, BigInt(value), le),
        size: 8,
    });

export const getI64Decoder = (config: NumberCodecConfig = {}): Decoder<bigint> =>
    numberDecoderFactory({
        config,
        get: (view, le) => view.getBigInt64(0, le),
        name: 'i64',
        size: 8,
    });

export const getI64Codec = (config: NumberCodecConfig = {}): Codec<number | bigint, bigint> =>
    combineCodec(getI64Encoder(config), getI64Decoder(config));