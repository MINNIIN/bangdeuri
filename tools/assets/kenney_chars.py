"""
Kenney Mini Characters 2.0 (CC0) → public/models/chars/*.glb

- 원본: https://opengameart.org/content/mini-character-1 (kenney_mini-characters_2.0.zip, "Models/GLB format")
- 미니미는 코드가 관절을 직접 돌리므로(avatar3d 동작 그대로) 원본에 든 애니메이션은 뺀다 → 용량이 확 준다.
- 바깥 텍스처(Textures/colormap.png)는 GLB 안에 넣는다.

사용: python tools/assets/kenney_chars.py <압축 푼 폴더의 'Models/GLB format' 경로>
"""
import json
import os
import struct
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'models', 'chars')

# 미니미 머리 모양 → Kenney 캐릭터
PICK = {
    'bob': 'character-female-e',
    'short': 'character-male-f',
    'long': 'character-female-f',
    'bun': 'character-female-b',
    'curly': 'character-male-a',
}


def pad(b, c=b'\0'):
    return b + c * ((4 - len(b) % 4) % 4)


def read_glb(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    rest = b[20 + n:]
    binbuf = rest[8:8 + struct.unpack('<I', rest[:4])[0]] if rest else b''
    return j, binbuf


def write_glb(path, j, buf):
    js = pad(json.dumps(j, separators=(',', ':')).encode(), b' ')
    buf = pad(buf)
    body = struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(buf), 0x004E4942) + buf
    open(path, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + len(body)) + body)


def strip(j, binbuf, src_dir):
    """애니메이션을 빼고, 쓰는 accessor·bufferView만 남겨 버퍼를 다시 짠다. 바깥 이미지는 안으로."""
    j.pop('animations', None)
    used_acc = set()
    for m in j['meshes']:
        for p in m['primitives']:
            used_acc.update(p['attributes'].values())
            if 'indices' in p:
                used_acc.add(p['indices'])
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            used_acc.add(s['inverseBindMatrices'])
    acc_map = {old: new for new, old in enumerate(sorted(used_acc))}
    accessors = [j['accessors'][i] for i in sorted(used_acc)]

    new_buf = b''
    views = []
    view_map = {}
    for a in accessors:
        v = a['bufferView']
        if v not in view_map:
            bv = dict(j['bufferViews'][v])
            data = binbuf[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
            new_buf = pad(new_buf)
            bv['byteOffset'] = len(new_buf)
            bv['buffer'] = 0
            new_buf += data
            view_map[v] = len(views)
            views.append(bv)
        a['bufferView'] = view_map[v]
    for im in j.get('images', []):
        if 'uri' in im:
            png = open(os.path.join(src_dir, im.pop('uri')), 'rb').read()
        else:
            bv = j['bufferViews'][im['bufferView']]
            png = binbuf[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        new_buf = pad(new_buf)
        views.append({'buffer': 0, 'byteOffset': len(new_buf), 'byteLength': len(png)})
        new_buf += png
        im['bufferView'] = len(views) - 1
        im['mimeType'] = 'image/png'
    for m in j['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = acc_map[p['indices']]
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    j['accessors'] = accessors
    j['bufferViews'] = views
    j['buffers'] = [{'byteLength': len(pad(new_buf))}]
    return j, new_buf


def main(src):
    os.makedirs(OUT, exist_ok=True)
    for hair, name in PICK.items():
        j, b = read_glb(os.path.join(src, name + '.glb'))
        j, b = strip(j, b, src)
        path = os.path.join(OUT, hair + '.glb')
        write_glb(path, j, b)
        print(hair, '<-', name, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main(sys.argv[1])
