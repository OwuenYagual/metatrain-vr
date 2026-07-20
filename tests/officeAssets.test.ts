import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { OFFICE_MODEL_PATH_LIST } from '../src/scene/officeAssets';

test('los modelos de la oficina existen localmente y son archivos GLB', () => {
    assert.equal(new Set(OFFICE_MODEL_PATH_LIST).size, OFFICE_MODEL_PATH_LIST.length);

    for (const publicPath of OFFICE_MODEL_PATH_LIST) {
        const filePath = path.join(process.cwd(), 'public', publicPath.replace(/^\//, ''));
        const header = readFileSync(filePath).subarray(0, 4).toString('ascii');

        assert.equal(path.extname(filePath), '.glb');
        assert.equal(header, 'glTF');
    }
});

test('el conjunto de mobiliario mantiene un presupuesto liviano para WebGL', () => {
    const totalBytes = OFFICE_MODEL_PATH_LIST.reduce((total, publicPath) => {
        const filePath = path.join(process.cwd(), 'public', publicPath.replace(/^\//, ''));
        return total + statSync(filePath).size;
    }, 0);

    assert.ok(totalBytes < 500_000, `Los modelos de oficina pesan ${totalBytes} bytes.`);
});
