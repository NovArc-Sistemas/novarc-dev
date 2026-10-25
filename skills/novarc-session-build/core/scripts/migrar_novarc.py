#!/usr/bin/env python3
"""migrar_novarc.py - move a repo's NOVARC workflow files into .novarc/.

Every non-code file the NOVARC flow versions (specs, pendings, ledgers, plans,
design docs, codex-review runs) used to live in a handful of legacy folders.
This script moves each one present to its place under .novarc/ with `git mv`,
so history follows the files and every blob keeps its hash: a published plan
that stores an old path still verifies (conjunto-load §3 maps the path).

All checks run before the first move; a failed check moves nothing. The map
below is the only list of legacy paths, in migration order (dados.md).

The script never commits, never pushes, never edits a file and never bypasses
a hook. The renames are left staged; it prints the commit to run next. The
person decides. Empty legacy folders left behind by `git mv` are removed
(an empty directory is not a file and git does not track it).

Usage:
  migrar_novarc.py --repo <abs> [--dry-run]

Exit codes:
  0  migrated, planned (--dry-run), or nothing to migrate
  1  usage error or a failed precondition (PARADO ...)
  2  collision with an existing or another target (COLISAO ...)
"""
import argparse
import os
import re
import subprocess
import sys

MAPA = [
    ("ai/specs", ".novarc/specs"),
    ("ai/pendings", ".novarc/pendings"),
    ("PENDINGS.md", ".novarc/PENDINGS.md"),
    ("docs/PENDINGS.md", ".novarc/PENDINGS.md"),
    (".superpowers/session-build", ".novarc/ledger/session-build"),
    (".superpowers/novarc-orq", ".novarc/ledger/novarc-orq"),
    (".superpowers/session-end", ".novarc/ledger/session-end"),
    ("ai/ledger", ".novarc/ledger"),
    ("docs/superpowers/plans", ".novarc/plans"),
    ("ai/plans", ".novarc/plans"),
    ("docs/superpowers/specs", ".novarc/design"),
    ("ai/design", ".novarc/design"),
    ("docs/codex-review", ".novarc/codex-review"),
    ("ai/artifact", ".novarc/artifact"),
    ("ai/code", ".novarc/code"),
]

# Root files whose mentions of a legacy path are reported, never edited (R10).
REVISAR = ("CLAUDE.md", "AGENTS.md", "README.md", ".gitattributes")


def mapear(p):
    """Map a repo-relative path through the first matching row; no match returns p."""
    for legado, novo in MAPA:
        if p == legado:
            return novo
        if p.startswith(legado + "/"):
            return novo + "/" + p[len(legado) + 1:]
    return p


def git(repo, *args):
    """The one place a git process starts."""
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True,
                          encoding="utf-8", errors="replace")


def norm(p):
    return os.path.normcase(os.path.realpath(p))


def linhas(r):
    return [l for l in r.stdout.splitlines() if l]


class Parser(argparse.ArgumentParser):
    def error(self, message):
        # argparse exits 2 by default; 2 is reserved for COLISAO.
        self.print_usage(sys.stderr)
        print(message, file=sys.stderr)
        sys.exit(1)


def main(argv):
    ap = Parser(description="Move NOVARC workflow files into .novarc/ with git mv.")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    repo = a.repo

    # 1. Absolute path to the top of a work tree.
    top = git(repo, "rev-parse", "--show-toplevel") if os.path.isabs(repo) and os.path.isdir(repo) else None
    if top is None or top.returncode != 0 or norm(top.stdout.strip()) != norm(repo):
        print("PARADO repo invalido %s" % repo)
        return 1

    # 2. .novarc must be tracked, never ignored (R14).
    if git(repo, "check-ignore", "-q", ".novarc/x").returncode == 0:
        print("PARADO .novarc ignorado")
        return 1

    # 3. Rows present. n = tracked files, reused by the MOVE line.
    rows = []
    for legado, novo in MAPA:
        if not os.path.lexists(os.path.join(repo, legado)):
            continue
        n = len(linhas(git(repo, "ls-files", "--", legado)))
        if n == 0 and git(repo, "check-ignore", "-q", legado).returncode == 0:
            print("SKIP ignorado %s" % legado)
            continue
        if n == 0 and not linhas(git(repo, "ls-files", "--others", "--exclude-standard", "--", legado)):
            continue  # empty folder on disk: nothing to move
        rows.append((legado, novo, n))
    if not rows:
        print("NADA A MIGRAR")
        return 0

    # 4. Untracked or ignored files under a kept row: git mv of a folder would carry
    # them into .novarc/ unversioned (nothing untracked or ignored is moved).
    soltos = [p for legado, _, _ in rows
              for extra in ((), ("--ignored",))
              for p in linhas(git(repo, "ls-files", "--others", *extra, "--exclude-standard", "--", legado))]
    if soltos:
        for p in soltos:
            print("PARADO nao versionado %s" % p)
        return 1

    # 5. Tracked changes: the renames must be the only staged work.
    if linhas(git(repo, "status", "--porcelain", "--untracked-files=no")):
        print("PARADO arvore suja")
        return 1

    # 6. Collisions (R4): target exists, shared target, or one target inside another.
    novos = [novo for _, novo, _ in rows]
    colide = set()
    for i, x in enumerate(novos):
        if os.path.lexists(os.path.join(repo, x)):
            colide.add(x)
        for j, y in enumerate(novos):
            if i != j and (x == y or y.startswith(x + "/")):
                colide |= {x, y}
    if colide:
        for x in dict.fromkeys(n for n in novos if n in colide):
            print("COLISAO %s" % x)
        return 2

    # 7. Notes that never stop the run.
    for l in linhas(git(repo, "worktree", "list", "--porcelain")):
        if l.startswith("worktree ") and norm(l[9:]) != norm(repo):
            print("NOTE worktree %s" % l[9:])
    pats = [re.compile(r"(?<![A-Za-z0-9_./-])" + re.escape(legado) + r"(?![A-Za-z0-9_-])") for legado, _ in MAPA]
    for f in REVISAR:
        path = os.path.join(repo, f)
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8", errors="replace") as fh:
            for i, line in enumerate(fh, 1):
                if any(p.search(line) for p in pats):
                    print("NOTE revisar %s:%d" % (f, i))

    # 8. Plan only.
    if a.dry_run:
        for legado, novo, n in rows:
            print("MOVE %s -> %s (%d arquivos)" % (legado, novo, n))
        print("PLANO %d itens" % len(rows))
        return 0

    # 9. Moves. A failure leaves the earlier moves staged and listed (not undone).
    for legado, novo, n in rows:
        os.makedirs(os.path.dirname(os.path.join(repo, novo)), exist_ok=True)
        r = git(repo, "mv", legado, novo)
        if r.returncode != 0:
            sys.stderr.write(r.stderr)
            print("PARADO git mv %s" % legado)
            return 1
        print("MOVE %s -> %s (%d arquivos)" % (legado, novo, n))
        # git mv leaves emptied parents (ai/, docs/) on disk; drop them up to the root.
        d = os.path.dirname(legado)
        while d:
            try:
                os.rmdir(os.path.join(repo, d))
            except OSError:
                break
            d = os.path.dirname(d)

    # 10. Done; the commit is the person's.
    print("MIGRADO %d itens" % len(rows))
    print('git -C %s commit -m "chore(novarc): move workflow files to .novarc"' % repo)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
