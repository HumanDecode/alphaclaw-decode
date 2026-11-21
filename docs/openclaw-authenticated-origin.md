# OpenClaw authenticated cron origin patch

Decode 0.8.4 pins a source-built OpenClaw 2026.11.6 staging candidate.

- Upstream: `06afb10d3272cc9deaf38ca6a3b7b839d5935638`.
- Patch commit: `2ab68dcbc19674d6b364f2cd2b7f96671c74b0af`.
- Artifact SHA256: `25ada643cf530b98d3dd42ce113e6a885d44d9b2f861bd3d13b5e59e58f04df5`.
- [Artifact, source diff, build manifest](https://github.com/HumanDecode/alphaclaw-decode/releases/tag/openclaw-2026.11.6-decode-origin.1). npm lockfile pins SHA512 integrity.

The patch preserves an external caller origin only when its authenticated channel requester matches. It does not derive authority from delivery targets or session names. Revocation, replay and unknown/mismatched authority remain denied. There are no schema or configuration migrations. Package version remains 2026.11.6; build metadata identifies the patch commit.

Source proof: 52 focused tests, Gateway typechecks, lint, format, full supported build and package-integrity check passed. Isolated package tests cover management capture, saved provenance reconciliation, scheduled account admission and refusal controls. This does not establish a complete live external-owner workflow.

Deploy only through an explicitly selected test-service commit until runtime verification and separate production approval. Previous healthy upstream-11.6 deployment is the immediate code rollback.
