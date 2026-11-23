"""
KayKit Furniture Bits · Restaurant Bits (CC0, Kay Lousberg) → public/models/furniture/<아이템>.glb

- 원본: https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0 , ...-Restaurant-Bits-1.0 (glTF + bin + 팔레트 png)
- 앱의 가구 아이템 이름(furniture3d.ts BUILDERS 키) → KayKit 모델. bin·png를 GLB 하나로 묶는다.
- 크기는 앱에서 예전 가구 크기에 맞춰 늘리므로 원본 그대로 둔다. 앞면은 +z.

사용: python tools/assets/kaykit_furniture.py
"""
import json
import os
import struct
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'models', 'furniture')
RAW = 'https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-{pack}-Bits-1.0/main/addons/kaykit_{lower}_bits/Assets/gltf/'

MAP = {
    'sofa': ('Furniture', 'couch_pillows'),
    'lowtable': ('Furniture', 'table_low'),
    'lamp': ('Furniture', 'lamp_standing'),
    'bed': ('Furniture', 'bed_double_A'),
    'wardrobe': ('Furniture', 'cabinet_medium_decorated'),
    'chair': ('Furniture', 'chair_A_wood'),
    'bookshelf': ('Furniture', 'shelf_B_large_decorated'),
    'desk': ('Furniture', 'table_medium'),
    'cactus': ('Furniture', 'cactus_medium_A'),
    'fridge': ('Restaurant', 'fridge_A_decorated'),
    'counter': ('Restaurant', 'kitchencounter_sink'),
}


def pad(b, c=b'\0'):
    return b + c * ((4 - len(b) % 4) % 4)


def fetch(url):
    with urllib.request.urlopen(url) as r:
        return r.read()


def main():
    os.makedirs(OUT, exist_ok=True)
    for item, (pack, name) in MAP.items():
        base = RAW.format(pack=pack, lower=pack.lower())
        j = json.loads(fetch(base + name + '.gltf'))
        buf = pad(fetch(base + j['buffers'][0]['uri']))
        for im in j.get('images', []):
            png = fetch(base + im.pop('uri'))
            j['bufferViews'].append({'buffer': 0, 'byteOffset': len(buf), 'byteLength': len(png)})
            im['bufferView'] = len(j['bufferViews']) - 1
            im['mimeType'] = 'image/png'
            buf = pad(buf + png)
        j['buffers'] = [{'byteLength': len(buf)}]
        js = pad(json.dumps(j, separators=(',', ':')).encode(), b' ')
        body = struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(buf), 0x004E4942) + buf
        path = os.path.join(OUT, item + '.glb')
        open(path, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + len(body)) + body)
        print(item, '<-', pack, name, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
