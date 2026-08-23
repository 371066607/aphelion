#!/usr/bin/env python3
"""
Aphelion 构建管线 (ADR-7)
src/*.js 按声明顺序内联进 template.html → game.html
铁律:
  1. 每个模块必须过 node --check (严格模式语法错误会静默炸整块脚本)
  2. 产物必须以 </html> 结尾 (大文件写入曾截断)
  3. 加载顺序在此处显式声明, 模块间禁止隐式依赖
"""
import subprocess, sys, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))

# ADR-7: 手工依赖顺序。新模块加进这里。
MODULE_ORDER = [
    "config.js",
    "utils.js",
    "save.js",
    "planet.js",
    "llm.js",
    "colony.js",
    "rivals.js",
    "combat.js",
    "world.js",
    "entities.js",
    "sfx.js",
    "ui.js",
    "main.js",
]

def node_check(path):
    r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"✗ 语法检查失败 {path}:\n{r.stderr}")
        sys.exit(1)

def main():
    tpl_path = os.path.join(ROOT, "template.html")
    tpl = open(tpl_path, encoding="utf-8").read()
    if "<!--SCRIPTS-->" not in tpl:
        print("✗ template.html 缺少 <!--SCRIPTS--> 注入点")
        sys.exit(1)

    parts = []
    for mod in MODULE_ORDER:
        path = os.path.join(ROOT, "src", mod)
        if not os.path.exists(path):
            print(f"✗ 缺少模块 {mod}")
            sys.exit(1)
        node_check(path)
        code = open(path, encoding="utf-8").read()
        # 防御: 模块代码里不允许出现 </script>(会提前终止脚本块)
        if "</script" in code.lower():
            print(f"✗ {mod} 含有 </script> 字面量(需转义)")
            sys.exit(1)
        parts.append(f"<script>\n{code}\n</script>")
        print(f"  ✓ {mod} ({len(code)//1024}KB)")

    out = tpl.replace("<!--SCRIPTS-->", "\n".join(parts))

    # 铁律 2: 尾部断言
    if not out.rstrip().endswith("</html>"):
        print("✗ 产物尾部异常(未以 </html> 结尾)")
        sys.exit(1)
    if out.count("<script") != out.count("</script>"):
        print(f"✗ script 标签不平衡: <{out.count('<script')} />{out.count('</script>')}")
        sys.exit(1)

    out_path = os.path.join(ROOT, "game.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(out)
        f.flush()
        os.fsync(f.fileno())

    size = os.path.getsize(out_path)
    print(f"\n✓ 构建成功 → game.html ({size//1024}KB)")

if __name__ == "__main__":
    main()
