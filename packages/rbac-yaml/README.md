# @holeauth/rbac-yaml

Node-only helper for loading, validating, and hot-reloading YAML-based
RBAC group definitions for `@holeauth/plugin-rbac`.

```ts
import { loadRbacYaml } from '@holeauth/rbac-yaml';
import { rbac } from '@holeauth/plugin-rbac';

const yaml = loadRbacYaml('./holeauth.rbac.yml', {
  watch: process.env.NODE_ENV !== 'production',
});

const plugin = rbac({ groups: yaml.snapshot.groups, adapter });
yaml.onReload((s) => plugin.reload(s.groups));
```

The `plugin-rbac` package itself is headless — no filesystem access —
so it stays edge-compatible when group definitions are passed directly
as an array instead of via YAML.
