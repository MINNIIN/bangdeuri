"""
PC방 소품: 게이밍 의자 · 모니터 · 본체 · 키보드.
크기와 기준점은 src/three/shop/pc3d.ts의 예전 도형과 같다 (앉는 높이·자리 좌표를 그대로 쓰려고).

blender --background --factory-startup --python tools/blender/pc_bang.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import box, cyl, export, join, plane, reset  # noqa: E402


def chair():
    """바닥이 원점, 모니터(북쪽, -z)를 본다. 방석 윗면 0.45, 등받이는 남쪽(+z)."""
    reset()
    parts = []
    # 별 모양 다리 5개 + 바퀴
    for i in range(5):
        a = i * 2 * math.pi / 5
        dx, dz = math.sin(a), math.cos(a)
        parts.append(box((0.05, 0.04, 0.26), (dx * 0.12, 0.06, dz * 0.12), 'dark', rot=(0, a, 0)))
        parts.append(cyl(0.028, 0.04, (dx * 0.245, 0.022, dz * 0.245), 'ink', seg=8))
    parts.append(cyl(0.05, 0.05, (0, 0.085, 0), 'dark', seg=8))
    parts.append(cyl(0.034, 0.26, (0, 0.23, 0), 'metal', seg=8))
    # 방석: 검은 틀 위에 강조색 쿠션 (위에서 볼 때 색이 크게 보이게)
    parts.append(box((0.5, 0.08, 0.48), (0, 0.39, 0), 'dark', bevel=0.025))
    parts.append(box((0.42, 0.05, 0.42), (0, 0.445, -0.01), 'accent', bevel=0.02))
    parts.append(box((0.12, 0.012, 0.4), (0, 0.474, -0.01), 'white', bevel=0.004))
    # 등받이 (뒤로 살짝 눕는다): 검은 틀 + 앞면 강조색 쿠션 + 가운데 흰 줄 + 머리 쿠션
    tilt = -0.12
    parts.append(box((0.52, 0.74, 0.1), (0, 0.86, 0.22), 'dark', bevel=0.035, rot=(tilt, 0, 0)))
    parts.append(box((0.4, 0.6, 0.04), (0, 0.83, 0.155), 'accent', bevel=0.018, rot=(tilt, 0, 0)))
    parts.append(box((0.1, 0.56, 0.01), (0, 0.83, 0.132), 'white', bevel=0.003, rot=(tilt, 0, 0)))
    for s in (-1, 1):
        # 어깨 날개 (게이밍 의자 특유의 튀어나온 옆판)
        parts.append(box((0.07, 0.34, 0.12), (s * 0.27, 1.02, 0.235), 'dark2', bevel=0.025, rot=(tilt, 0, 0)))
    parts.append(box((0.28, 0.13, 0.07), (0, 1.15, 0.14), 'dark2', bevel=0.03, rot=(tilt, 0, 0)))
    # 등받이 뒷면 (보통 카메라가 보는 쪽): 강조색 띠 두 줄 + 가운데 마크
    for s in (-1, 1):
        parts.append(box((0.07, 0.6, 0.012), (s * 0.15, 0.85, 0.276), 'accent', bevel=0.004, rot=(tilt, 0, 0)))
    parts.append(box((0.12, 0.12, 0.012), (0, 0.98, 0.282), 'white', bevel=0.004, rot=(tilt, 0, 0)))
    # 팔걸이
    for s in (-1, 1):
        parts.append(box((0.04, 0.18, 0.04), (s * 0.27, 0.52, 0.04), 'metal', bevel=0.006))
        parts.append(box((0.08, 0.04, 0.3), (s * 0.27, 0.625, 0.02), 'dark2', bevel=0.012))
    join(parts, 'pc_chair')
    export('pc/chair')


def monitor():
    """책상 윗면이 원점. 화면은 남쪽(+z, 손님 쪽)을 본다. 화면 가운데 높이 0.385."""
    reset()
    parts = [
        box((0.26, 0.02, 0.17), (0, 0.01, 0), 'dark', bevel=0.006),
        box((0.06, 0.26, 0.04), (0, 0.15, -0.04), 'dark2', bevel=0.008),
        box((0.74, 0.47, 0.06), (0, 0.385, 0), 'dark', bevel=0.016),
        box((0.42, 0.28, 0.06), (0, 0.385, -0.05), 'dark2', bevel=0.02),
        # 아래 테두리 가운데 로고 · 전원 불빛
        box((0.08, 0.016, 0.006), (0, 0.168, 0.031), 'metal', bevel=0.002),
        box((0.018, 0.012, 0.006), (0.31, 0.168, 0.031), 'cyan', bevel=0.002),
    ]
    join(parts, 'pc_monitor')
    plane((0.67, 0.39), (0, 0.39, 0.0305), 'screen', facing='+z', name='screen')
    export('pc/monitor')


def tower():
    """책상 윗면이 원점, 앞이 남쪽(+z). RGB 옆판은 서쪽(-x)."""
    reset()
    parts = [
        box((0.2, 0.42, 0.42), (0, 0.21, 0), 'dark', bevel=0.014),
        box((0.012, 0.36, 0.36), (-0.1, 0.21, 0), 'dark2', bevel=0.004),
        # 앞면 통풍구 3줄 + 전원 버튼
        *[box((0.13, 0.014, 0.008), (0, 0.32 - i * 0.04, 0.211), 'dark2', bevel=0.003) for i in range(3)],
        cyl(0.016, 0.01, (0.0, 0.385, 0.211), 'cyan', seg=8, rot=(math.pi / 2, 0, 0)),
        # 받침 다리
        box((0.18, 0.02, 0.06), (0, 0.0, 0.15), 'ink', bevel=0.004),
        box((0.18, 0.02, 0.06), (0, 0.0, -0.15), 'ink', bevel=0.004),
    ]
    join(parts, 'pc_tower')
    box((0.006, 0.3, 0.3), (-0.108, 0.21, 0), 'rgb', bevel=0, name='rgb')
    export('pc/tower')


def keyboard():
    """책상 윗면이 원점, 손님 쪽이 남쪽(+z). 자판은 3줄, 밑판이 RGB로 빛난다."""
    reset()
    parts = [box((0.44, 0.022, 0.15), (0, 0.011, 0), 'dark', bevel=0.006)]
    for row in range(3):
        n = 12 if row < 2 else 9
        for i in range(n):
            w = 0.026 if not (row == 2 and i == 4) else 0.12
            x = -0.19 + i * 0.033 + (0.012 if row == 1 else 0)
            if row == 2 and i > 4:
                x += 0.09
            parts.append(box((w, 0.012, 0.026), (x + w / 2 - 0.013, 0.028, -0.045 + row * 0.036), 'white' if (row + i) % 5 else 'accent', bevel=0.003))
    join(parts, 'pc_keyboard')
    box((0.41, 0.004, 0.12), (0, 0.022, 0), 'rgb', bevel=0, name='rgb')
    export('pc/keyboard')


chair()
monitor()
tower()
keyboard()
