#!/usr/bin/env python3
"""Verification of `migrar_novarc.py`: the move of NOVARC workflow files into .novarc/.

Stdlib only. Every case builds a throwaway git repo under the OS temp dir,
runs the script as a subprocess and checks its exact output lines, the exit
code and the resulting git state. Class PlanoAntigo proves the git facts the
conjunto-load §3 rule relies on (old commit holds the old path, the default
branch holds the new one, same blob) and pins the rule's text.

Usage: python -m unittest test_migrar_novarc -v
"""
import ast
import hashlib
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "migrar_novarc.py")
CONJUNTO_LOAD = os.path.join(HERE, "..", "..", "steps", "conjunto-load.md")
DRIFT = "o spec mudou no repositório depois do planejamento: peça à NOVARC para atualizar o planejamento"

A1 = {
    "ai/specs/EXM/C01-S01-a/spec.md": "# spec\n",
    "ai/specs/EXM/artefato.txt": "https://example.invalid/a\n",
    "PENDINGS.md": "# pendings\n",
    ".superpowers/session-build/20261022-1202/ledger.md": "# ledger\n",
    "docs/codex-review/c01-s01-20261022-2235/PLAN.md": "# plan\n",
}
A1_MOVES = [
    "MOVE ai/specs -> .novarc/specs (2 arquivos)",
    "MOVE PENDINGS.md -> .novarc/PENDINGS.md (1 arquivos)",
    "MOVE .superpowers/session-build -> .novarc/ledger/session-build (1 arquivos)",
    "MOVE docs/codex-review -> .novarc/codex-review (1 arquivos)",
]


def norm(p):
    return os.path.normcase(os.path.realpath(p))


def g(repo, *args, check=True):
    r = subprocess.run(["git", "-C", repo] + list(args), capture_output=True, text=True)
    if check and r.returncode != 0:
        raise AssertionError("git %s: %s" % (" ".join(args), r.stderr))
    return r


def commit(repo, msg):
    g(repo, "add", "-A")
    g(repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "commit", "-q", "-m", msg)


def write(repo, files):
    for rel, text in files.items():
        path = os.path.join(repo, *rel.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)


def run(repo, *args):
    r = subprocess.run([sys.executable, SCRIPT, "--repo", repo] + list(args), capture_output=True, text=True,
                       encoding="utf-8")
    return r.returncode, r.stdout.splitlines()


def porcelain(repo):
    return g(repo, "status", "--porcelain").stdout.splitlines()


class Base(unittest.TestCase):
    def tmpdir(self):
        t = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(t.cleanup)
        return t.name

    def fixture(self, files, gitignore=None):
        repo = self.tmpdir()
        g(repo, "init", "-q", "-b", "main")
        g(repo, "config", "core.autocrlf", "false")
        if gitignore is not None:
            write(repo, {".gitignore": gitignore})
        write(repo, files)
        commit(repo, "inicio")
        return repo

    def migrated(self):
        repo = self.fixture(A1)
        code, out = run(repo)
        self.assertEqual(code, 0, out)
        commit(repo, "chore(novarc): move")
        return repo


class Migrar(Base):
    def test_a1_move_tudo(self):
        repo = self.fixture(A1)
        head = g(repo, "log", "-1", "--format=%H").stdout
        code, out = run(repo)
        self.assertEqual(code, 0, out)
        moves = [l for l in out if l.startswith("MOVE ") or l.startswith("MIGRADO ")]
        self.assertEqual(moves, A1_MOVES + ["MIGRADO 4 itens"])
        lines = porcelain(repo)
        self.assertEqual(len(lines), 5, lines)
        self.assertTrue(all(l.startswith("R") for l in lines), lines)
        self.assertEqual(g(repo, "log", "-1", "--format=%H").stdout, head)
        for d in ("ai", "docs", ".superpowers"):
            self.assertFalse(os.path.exists(os.path.join(repo, d)), d)
        self.assertIn('git -C %s commit -m "chore(novarc): move workflow files to .novarc"' % repo, out)

    def test_a2_colisao_specs(self):
        repo = self.fixture(dict(A1, **{".novarc/specs/OUTRO/x.md": "x\n"}))
        code, out = run(repo)
        self.assertEqual(code, 2, out)
        self.assertIn("COLISAO .novarc/specs", out)
        self.assertEqual(porcelain(repo), [])

    def test_a2_colisao_dois_pendings(self):
        repo = self.fixture({"PENDINGS.md": "a\n", "docs/PENDINGS.md": "b\n"})
        code, out = run(repo)
        self.assertEqual(code, 2, out)
        self.assertEqual([l for l in out if l.startswith("COLISAO")], ["COLISAO .novarc/PENDINGS.md"])
        self.assertEqual(porcelain(repo), [])

    def test_a2_colisao_aninhada(self):
        repo = self.fixture({"ai/ledger/x.md": "x\n", ".superpowers/session-build/r/ledger.md": "l\n"})
        code, out = run(repo)
        self.assertEqual(code, 2, out)
        self.assertTrue(any(l.startswith("COLISAO ") for l in out), out)
        self.assertEqual(porcelain(repo), [])

    def test_colisao_quando_novo_existe(self):
        repo = self.migrated()
        write(repo, {".novarc/plans/y.md": "y\n", "docs/superpowers/plans/x.md": "x\n"})
        commit(repo, "mais")
        code, out = run(repo)
        self.assertEqual(code, 2, out)
        self.assertIn("COLISAO .novarc/plans", out)

    def test_a2_arvore_suja(self):
        repo = self.fixture(A1)
        write(repo, {"PENDINGS.md": "mudou\n"})
        code, out = run(repo)
        self.assertEqual(code, 1, out)
        self.assertIn("PARADO arvore suja", out)
        self.assertEqual(porcelain(repo), [" M PENDINGS.md"])

    def test_a2_nao_versionado(self):
        repo = self.fixture(A1)
        write(repo, {"ai/specs/EXM/rascunho.md": "r\n"})
        code, out = run(repo)
        self.assertEqual(code, 1, out)
        self.assertIn("PARADO nao versionado ai/specs/EXM/rascunho.md", out)
        self.assertEqual(porcelain(repo), ["?? ai/specs/EXM/rascunho.md"])

    def test_ignorado_dentro_de_pasta_movida(self):
        repo = self.fixture({"ai/specs/E/spec.md": "s\n"}, gitignore="ai/specs/E/*.tmp\n")
        write(repo, {"ai/specs/E/notes.tmp": "n\n"})
        code, out = run(repo)
        self.assertEqual(code, 1, out)
        self.assertIn("PARADO nao versionado ai/specs/E/notes.tmp", out)
        self.assertFalse([l for l in out if l.startswith("MOVE ")], out)
        self.assertEqual(porcelain(repo), [])

    def test_a3_segunda_vez(self):
        repo = self.migrated()
        code, out = run(repo)
        self.assertEqual(code, 0, out)
        self.assertIn("NADA A MIGRAR", out)

    def test_a3_dry_run(self):
        repo = self.fixture(A1)
        code, out = run(repo, "--dry-run")
        self.assertEqual(code, 0, out)
        self.assertEqual([l for l in out if l.startswith("MOVE ") or l.startswith("PLANO ")],
                         A1_MOVES + ["PLANO 4 itens"])
        self.assertEqual(porcelain(repo), [])

    def test_a10_note_revisar(self):
        claude = "".join("linha %d\n" % i for i in range(1, 12)) + "specs ficam em ai/specs/\n"
        repo = self.fixture({"CLAUDE.md": claude, "ai/specs/EXM/spec.md": "s\n"})
        path = os.path.join(repo, "CLAUDE.md")
        with open(path, "rb") as fh:
            before = fh.read()
        code, out = run(repo)
        self.assertEqual(code, 0, out)
        self.assertIn("NOTE revisar CLAUDE.md:12", out)
        with open(path, "rb") as fh:
            self.assertEqual(fh.read(), before)

    def test_note_revisar_ignora_novarc(self):
        repo = self.fixture({"README.md": "veja .novarc/PENDINGS.md e .novarc/specs\n", "ai/specs/EXM/spec.md": "s\n"})
        code, out = run(repo)
        self.assertEqual(code, 0, out)
        self.assertNotIn("NOTE revisar README.md:1", out)

    def test_a11_ignorado(self):
        repo = self.fixture({".superpowers/session-build/r/ledger.md": "l\n", "ai/specs/EXM/spec.md": "s\n"},
                            gitignore=".superpowers/\n")
        code, out = run(repo)
        self.assertEqual(code, 0, out)
        self.assertIn("SKIP ignorado .superpowers/session-build", out)
        self.assertTrue(os.path.exists(os.path.join(repo, ".superpowers", "session-build", "r", "ledger.md")))

    def test_pasta_vazia_ignorada(self):
        repo = self.fixture({"ai/specs/EXM/spec.md": "s\n"})
        os.makedirs(os.path.join(repo, "ai", "plans"))
        code, out = run(repo)
        self.assertEqual(code, 0, out)
        self.assertFalse([l for l in out if "ai/plans" in l], out)

    def test_a12_follow_e_estatico(self):
        repo = self.migrated()
        log = g(repo, "log", "--follow", "--format=%s", "--", ".novarc/specs/EXM/C01-S01-a/spec.md").stdout
        self.assertIn("inicio", log.splitlines())
        with open(SCRIPT, encoding="utf-8") as fh:
            src = fh.read()
        consts = set()
        for node in ast.walk(ast.parse(src)):
            if not isinstance(node, ast.Call):
                continue
            f = node.func
            is_git = isinstance(f, ast.Name) and f.id == "git"
            is_sub = isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) and f.value.id == "subprocess"
            if is_git or is_sub:
                consts |= {n.value for n in ast.walk(node) if isinstance(n, ast.Constant) and isinstance(n.value, str)}
        for bad in ("commit", "push", "reset", "--no-verify"):
            self.assertNotIn(bad, consts)
        self.assertNotIn("--no-verify", src)
        self.assertNotIn("core.hooksPath", src)

    def test_a14_novarc_ignorado(self):
        repo = self.fixture(A1, gitignore=".novarc/\n")
        code, out = run(repo)
        self.assertEqual(code, 1, out)
        self.assertIn("PARADO .novarc ignorado", out)
        self.assertEqual(porcelain(repo), [])

    def test_repo_relativo(self):
        code, out = run("relativo")
        self.assertEqual(code, 1, out)
        self.assertTrue(out and out[0].startswith("PARADO repo invalido"), out)

    def test_repo_barra_invertida_e_barra_final(self):
        repo = self.fixture({"ai/specs/EXM/spec.md": "s\n"})
        arg = (repo.replace("/", "\\") if os.name == "nt" else repo) + os.sep
        code, out = run(arg, "--dry-run")
        self.assertEqual(code, 0, out)
        self.assertFalse([l for l in out if l.startswith("PARADO repo invalido")], out)

    def test_worktree_note(self):
        repo = self.fixture({"ai/specs/EXM/spec.md": "s\n"})
        wt = os.path.join(self.tmpdir(), "wt")
        g(repo, "worktree", "add", "-q", wt, "-b", "w")
        code, out = run(repo, "--dry-run")
        self.assertEqual(code, 0, out)
        notes = [norm(l[len("NOTE worktree "):]) for l in out if l.startswith("NOTE worktree ")]
        self.assertEqual(notes, [norm(wt)])

    def test_mapear(self):
        sys.path.insert(0, HERE)
        import migrar_novarc
        m = migrar_novarc.mapear
        self.assertEqual(m("ai/specs/X/C01-S01-a/"), ".novarc/specs/X/C01-S01-a/")
        self.assertEqual(m("src/a/"), "src/a/")
        self.assertEqual(m("ai/specsX/"), "ai/specsX/")
        self.assertEqual(m("docs/superpowers/specs/a.md"), ".novarc/design/a.md")
        self.assertEqual(len(migrar_novarc.MAPA), 15)


def show(repo, ref, *paths):
    """Raw bytes of the first path that exists at ref, or None (no text=True: hashes match the blob)."""
    for p in paths:
        r = subprocess.run(["git", "-C", repo, "show", "%s:%s" % (ref, p)], capture_output=True)
        if r.returncode == 0:
            return r.stdout
    return None


def checar(repo, commit_sha, arq_repo, nome, h):
    """The conjunto-load §3 rule: commit check stored-first, drift check mapped-first."""
    sys.path.insert(0, HERE)
    import migrar_novarc
    stored = arq_repo + nome
    mapped = migrar_novarc.mapear(stored)
    recorded = show(repo, commit_sha, stored, mapped)
    built = show(repo, "origin/main", mapped, stored)
    for blob in (recorded, built):
        if blob is None or hashlib.sha256(blob).hexdigest() != h:
            return DRIFT
    return None


class PlanoAntigo(Base):
    def publicado(self):
        repo = self.fixture(A1)
        sha = g(repo, "rev-parse", "HEAD").stdout.strip()
        h = hashlib.sha256(show(repo, "HEAD", "ai/specs/EXM/C01-S01-a/spec.md")).hexdigest()
        code, out = run(repo)
        self.assertEqual(code, 0, out)
        commit(repo, "chore(novarc): move")
        origin = self.tmpdir()
        g(origin, "init", "-q", "--bare")
        g(repo, "remote", "add", "origin", origin)
        g(repo, "push", "-q", "origin", "HEAD:main")
        g(repo, "fetch", "-q", "origin")
        return repo, sha, h

    def test_plano_antigo_hash(self):
        repo, sha, h = self.publicado()
        self.assertIsNone(show(repo, sha, ".novarc/specs/EXM/C01-S01-a/spec.md"))
        self.assertIsNone(show(repo, "origin/main", "ai/specs/EXM/C01-S01-a/spec.md"))
        self.assertEqual(hashlib.sha256(show(repo, "origin/main", ".novarc/specs/EXM/C01-S01-a/spec.md")).hexdigest(), h)
        self.assertIsNone(checar(repo, sha, "ai/specs/EXM/C01-S01-a/", "spec.md", h))

    def test_plano_antigo_drift(self):
        repo, sha, h = self.publicado()
        write(repo, {".novarc/specs/EXM/C01-S01-a/spec.md": "# spec mudou\n"})
        commit(repo, "edita")
        g(repo, "push", "-q", "origin", "HEAD:main")
        g(repo, "fetch", "-q", "origin")
        self.assertEqual(checar(repo, sha, "ai/specs/EXM/C01-S01-a/", "spec.md", h), DRIFT)

    def test_ordem_com_os_dois_caminhos(self):
        repo, sha, h = self.publicado()
        old = "ai/specs/EXM/C01-S01-a/spec.md"
        write(repo, {old: A1[old], ".novarc/specs/EXM/C01-S01-a/spec.md": "# spec mudou\n"})
        commit(repo, "os dois")
        g(repo, "push", "-q", "origin", "HEAD:main")
        g(repo, "fetch", "-q", "origin")
        # Stored path at origin/main still holds the old blob: only mapped-first sees the drift.
        self.assertEqual(hashlib.sha256(show(repo, "origin/main", old)).hexdigest(), h)
        self.assertNotEqual(hashlib.sha256(show(repo, "origin/main", ".novarc/specs/EXM/C01-S01-a/spec.md")).hexdigest(), h)
        self.assertEqual(hashlib.sha256(show(repo, sha, old, ".novarc/specs/EXM/C01-S01-a/spec.md")).hexdigest(), h)
        self.assertEqual(checar(repo, sha, "ai/specs/EXM/C01-S01-a/", "spec.md", h), DRIFT)

    def test_conjunto_load_texto(self):
        with open(CONJUNTO_LOAD, encoding="utf-8") as fh:
            text = fh.read()
        sec3 = text[text.index("## 3."):text.index("## 4.")]
        self.assertIn("recorded content: git show <commit>:<P_stored>, else <P_mapped>", sec3)
        self.assertIn("drift: git show origin/$DEFAULT:<P_mapped>, else <P_stored>", sec3)
        self.assertIn(".novarc/specs/", sec3)
        self.assertIn(DRIFT, " ".join(sec3.split()))


if __name__ == "__main__":
    unittest.main()
