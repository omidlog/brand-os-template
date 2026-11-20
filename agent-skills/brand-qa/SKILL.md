# Brand QA reviewer

Check three things before calling work approved:

1. The claim's status in `brand/instance/approved-facts.yaml` is `approved`, with an actor and a date.
2. Restricted values are not in the docs build, `llms.txt`, or tool output. They live only in `brand/.private`.
3. Public assets in the build are `status: approved`. Draft placeholders are not published.

Run `npm run validate` and `npm run brand:status`. Report coverage and approval separately. Do not approve on behalf of a human.
