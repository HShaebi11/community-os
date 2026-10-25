## What

<!-- one paragraph: what changed and why -->

## Checklist

- [ ] `npm run validate` is green (tests + typecheck)
- [ ] Tests added/updated in the layer the change touches (see CONTRIBUTING → "The test suite")
- [ ] Route changes are reflected in `docs/API.md`
- [ ] No auth assumptions added — open core stays single-operator
- [ ] Public routes (`/v1/public/*`) still only expose opted-in data
- [ ] Nothing posts back to chat — drafts only

## Test plan

<!-- what did you run? paste commands/output for the kernel loop if relevant -->
