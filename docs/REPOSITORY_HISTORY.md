# Repository history

The publication branch contains 74 non-empty commits with four-word subjects.
The initial application snapshot is grouped into 60 component and configuration
commits, followed by the 14 subsequent development changes. Publication commits
use the configured Git identity and their creation timestamps.

The original 15-commit local history is preserved in a verified private Git bundle
at `.local/publication/history-before-publish.bundle`. That backup, dotenv files,
deployment credentials, generated builds and downloaded models are excluded from
the public repository.

Deployment evidence was collected before this publication. Existing evidence JSON
retains its original hashes and measurements; the corresponding published commits
have identical source trees:

| Original source | Published source | Evidence |
| --- | --- | --- |
| `3b4f642b1b6b` | [bfd83c215ee8](https://github.com/Rafi-SBM/koe-Yuki/commit/bfd83c215ee8f385cb7ba5afcbc3447d1023d7b4) | Initial application snapshot |
| `283069f884dd` | [69dfab50f94a](https://github.com/Rafi-SBM/koe-Yuki/commit/69dfab50f94ac4fac9834684564bd1a67781b59b) | DEPLOYMENT_EVIDENCE.json |
| `3c8a4dfc366c` | [24a67c552bff](https://github.com/Rafi-SBM/koe-Yuki/commit/24a67c552bffce3dac0e7081204fbb203705cb7c) | RECOVERY_EVIDENCE.json |
| `efe3b789fcf2` | [7c4223e4406a](https://github.com/Rafi-SBM/koe-Yuki/commit/7c4223e4406a5cfe83652a4d2c36a056a95369dd) | CAPACITY_EVIDENCE.json |

Publication also updates README/repository links and this guide. Application code,
runtime dependencies, model checksums, voice previews and deployed runtime behavior
match the verified source. Python development dependencies additionally pin a patched
`setuptools` version: the initial GitHub runner's preinstalled 79.0.1 failed the
security audit before tests ran. Dependency installation, compatibility, auditing
and regression tests have separate named checks. This correction is included in
the publication commit, keeping the branch at 74 commits. Deployment remains an
explicit Vercel/LiveKit release step.

For future changes, group related files by behavior, keep commit subjects to four
words, and run the relevant checks before pushing. Credentials remain in private
environment configuration.
