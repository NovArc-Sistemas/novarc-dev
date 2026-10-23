#!/usr/bin/env python3
"""Verification of `ledger.py sweep`: the `since=` field on SWEEP OUTSTANDING lines.

Stdlib only. Builds a throwaway ledger dir with `init`, appends lines by hand
(a stamped one, as `append` writes it, and a hand-written one with no stamp),
runs `sweep` and checks the exact output lines, the summary and the exit code.

Usage: python test_ledger_sweep.py
"""
import os
import subprocess
import sys
import tempfile
import unittest

LEDGER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ledger.py")


def run(*args):
    return subprocess.run([sys.executable, LEDGER] + list(args), capture_output=True, text=True)


class SweepSince(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name
        r = run("init", "--dir", self.dir, "--fork", "c03-s01", "--run-id", "20261023-0910", "--specs", "c03-s01")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.path = os.path.join(self.dir, "fork-c03-s01.md")

    def tearDown(self):
        self.tmp.cleanup()

    def add(self, *lines):
        with open(self.path, "a", encoding="utf-8", newline="\n") as fh:
            for line in lines:
                fh.write(line + "\n")

    def test_since_from_stamp_and_dash_for_handwritten(self):
        self.add("LOCK migration 20261023_auditoria  # 2026-10-23T12:00:00Z", "LOCK deploy fnA")
        r = run("sweep", "--dir", self.dir)
        out = r.stdout.splitlines()
        self.assertIn("SWEEP OUTSTANDING c03-s01 deploy fnA [UNGRANTED] since=- LOCK deploy fnA", out)
        self.assertIn("SWEEP OUTSTANDING c03-s01 migration 20261023_auditoria [UNGRANTED] "
                      "since=2026-10-23T12:00:00Z LOCK migration 20261023_auditoria", out)
        self.assertIn("SWEEP SUMMARY forks=1 grants=0 outstanding=2 ungranted=2", out)
        self.assertEqual(r.returncode, 1)

    def test_release_clears_and_exit_zero(self):
        self.add("LOCK file src/a.ts src/b.ts  # 2026-10-23T12:00:00Z", "RELEASE file src/a.ts  # 2026-10-23T12:05:00Z")
        r = run("sweep", "--dir", self.dir)
        lines = [l for l in r.stdout.splitlines() if l.startswith("SWEEP OUTSTANDING")]
        self.assertEqual(lines, ["SWEEP OUTSTANDING c03-s01 file src/b.ts [UNGRANTED] "
                                 "since=2026-10-23T12:00:00Z LOCK file src/a.ts src/b.ts"])
        self.assertEqual(r.returncode, 1)
        self.add("RELEASE file src/b.ts  # 2026-10-23T12:06:00Z")
        r = run("sweep", "--dir", self.dir)
        self.assertNotIn("SWEEP OUTSTANDING", r.stdout)
        self.assertIn("SWEEP SUMMARY forks=1 grants=0 outstanding=0 ungranted=0", r.stdout)
        self.assertEqual(r.returncode, 0)


if __name__ == "__main__":
    unittest.main()
