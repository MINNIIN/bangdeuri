"""
방들이 Blender 공용 헬퍼. 모든 모델은 이 파일의 규칙으로 만든다 → 그림체가 하나로 유지된다.

규칙 (하우스 스타일)
- 각진 로우폴리 + 아주 얇은 모서리 깎기(bevel 1단). 매끈한 곡면 대신 면이 보이는 도형.
- 색은 PALETTE에서만 고른다. 재질 이름 = 팔레트 이름 → 앱에서 이름으로 색을 바꿔 칠할 수 있다.
- 좌표는 three.js 기준으로 적는다: x 동쪽, y 위, z 남쪽(손님 쪽). 단위 m. 바닥(또는 올려놓는 면)이 y=0.
- 앱에서 따로 바꾸는 부분(화면, RGB 띠 등)은 객체 이름을 붙여 둔다 → GLB 메시 이름으로 찾는다.

사용: blender --background --factory-startup --python tools/blender/<모델>.py
"""
import math
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'models')

# 공용 팔레트 (sRGB hex). 툰 명암은 앱에서 입히므로 여기선 기본색만.
PALETTE = {
    'ink': '#2b2233',
    'dark': '#262a3d',
    'dark2': '#3a3f5a',
    'metal': '#9aa3b5',
    'white': '#f3eff7',
    'cream': '#f6ead8',
    'wood': '#c98a55',
    'wood_dark': '#8a5a36',
    'pink': '#ff8fb8',
    'red': '#ff5a4f',
    'orange': '#ff9a3d',
    'yellow': '#ffd94a',
    'mint': '#6fd6b8',
    'green': '#59c26b',
    'sky': '#7cc6ff',
    'cyan': '#7cf0ff',
    'blue': '#4d7dff',
    'purple': '#9d8cff',
    'accent': '#ff4f7a',  # 앱에서 자리마다 바꿔 칠하는 강조색 자리
    'screen': '#141a3a',  # 앱에서 캔버스 그림으로 바꾸는 화면 자리
    'rgb': '#7cf0ff',  # 앱에서 색이 도는 RGB 띠 자리
}


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name):
    """팔레트 이름으로 재질 하나 (같은 이름은 같이 쓴다)"""
    m = bpy.data.materials.get(name)
    if m:
        return m
    hexs = PALETTE[name].lstrip('#')
    rgb = [_srgb_to_linear(int(hexs[i:i + 2], 16) / 255) for i in (0, 2, 4)]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 0.8
    m.diffuse_color = (*rgb, 1)
    return m


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _to_blender(x, y, z):
    """three.js 좌표(x, 위 y, 남쪽 z) → Blender 좌표(x, 앞 -z, 위 y). glTF 내보내기가 다시 three 좌표로 돌린다."""
    return (x, -z, y)


def _finish(obj, mat_name, bevel, name):
    obj.data.materials.append(material(mat_name))
    if bevel and bevel > 0:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = 'ANGLE'
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons:
        p.use_smooth = False
    if name:
        obj.name = name
        obj.data.name = name
    return obj


def box(size, at, mat='white', bevel=0.012, rot=(0, 0, 0), name=None):
    """size = (너비 x, 높이 y, 깊이 z), at = 가운데 (three 좌표), rot = three 축 기준 회전(라디안)"""
    w, h, d = size
    bpy.ops.mesh.primitive_cube_add(size=1, location=_to_blender(*at))
    o = bpy.context.active_object
    o.scale = (w, d, h)
    o.rotation_euler = (rot[0], -rot[2], rot[1])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return _finish(o, mat, min(bevel, w / 3, h / 3, d / 3), name)


def cyl(radius, height, at, mat='white', seg=10, bevel=0.008, top_radius=None, rot=(0, 0, 0), name=None):
    """세운 원기둥 (위아래 y). seg는 일부러 적게 → 각진 로우폴리"""
    if top_radius is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=radius, depth=height, location=_to_blender(*at))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=radius, radius2=top_radius, depth=height, location=_to_blender(*at))
    o = bpy.context.active_object
    o.rotation_euler = (rot[0], -rot[2], rot[1])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return _finish(o, mat, min(bevel, radius / 3, height / 3), name)


def plane(size, at, mat='screen', facing='+z', name=None):
    """얇은 판 (화면 같은 것). facing: 앞면이 보는 쪽"""
    w, h = size
    bpy.ops.mesh.primitive_plane_add(size=1, location=_to_blender(*at))
    o = bpy.context.active_object
    o.scale = (w, h, 1)
    if facing == '+z':
        o.rotation_euler = (math.pi / 2, 0, 0)
    elif facing == '-z':
        o.rotation_euler = (-math.pi / 2, 0, math.pi)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return _finish(o, mat, 0, name)


def join(objs, name):
    """이름 없는(따로 바꿀 일 없는) 조각들을 한 메시로 합친다"""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    return o


def export(rel_path):
    """씬 전체를 public/models/<rel_path>.glb 로"""
    path = os.path.join(OUT, rel_path + '.glb')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
        export_normals=True,
        export_texcoords=False,
        export_animations=False,
        export_extras=False,
    )
    print('exported', os.path.relpath(path, ROOT), os.path.getsize(path), 'bytes')
    sys.stdout.flush()
