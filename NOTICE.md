# Third-party notices

PhoneForensics is licensed under the MIT License (see `LICENSE`) and covers only
the code in this repository.

## Mobile Verification Toolkit (MVT)

PhoneForensics depends on, and runs, the [Mobile Verification Toolkit](https://github.com/mvt-project/mvt)
developed by Amnesty International's Security Lab. MVT is **not** part of this repository: it is
installed separately from PyPI (`pip install mvt`) and remains governed by the
[MVT License 1.1](https://license.mvt.re/1.1/).

PhoneForensics is a "Larger Work" in the sense of the MVT License. The MVT License's conditions
therefore apply to **any use of PhoneForensics to analyse a device**, including:

> Use of Covered Software or of a Larger Work is permitted provided that the Data Owner must
> explicitly consent to the procedure, free from any form of coercion, and must be fully informed
> about the nature of the procedure, its privacy implications, and any data retention and
> disposal policy.

If you redistribute PhoneForensics together with MVT (for example as a packaged installer), you
must also distribute MVT under its own license, inform recipients that MVT is governed by the
MVT License 1.1, and tell them where to get MVT's source code.

PhoneForensics is an independent project and is not affiliated with or endorsed by
Amnesty International.

## Threat indicators

Indicators of compromise are downloaded at runtime from
[mvt-project/mvt-indicators](https://github.com/mvt-project/mvt-indicators) and other sources listed
there; each source keeps its own license and attribution.

## Other dependencies

- [Flask](https://flask.palletsprojects.com/) — BSD-3-Clause
