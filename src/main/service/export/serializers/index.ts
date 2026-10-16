import { FormatDescriptor, FormatId, Serializer } from '../types';
import { CsvSerializer } from './csv';
import { JsonLinesSerializer, JsonSerializer } from './json';
import { ParquetSerializer } from './parquet';

/** every output format , a new one only needs a Serializer and a line here */
const SERIALIZERS: Serializer<any>[] = [new CsvSerializer(), new JsonSerializer(), new JsonLinesSerializer(), new ParquetSerializer()];

export const serializerFor = (id: FormatId): Serializer<any> | undefined => SERIALIZERS.find((s) => s.id === id);

export const formatDescriptors = (): FormatDescriptor[] =>
    SERIALIZERS.map((s) => ({
        id: s.id,
        label: s.label,
        extension: s.extension,
        streamCompressible: s.streamCompressible,
        defaults: s.defaults,
        defaultChunk: s.defaultChunk || { by: 'none' },
    }));
