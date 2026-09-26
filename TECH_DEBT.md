# Known debt

Things deliberately left undone, with the reason. Deleting an entry means it was done
or decided against — not that it was forgotten.

## Dev overlay sits over the radar

Next's dev indicator renders bottom-left, on top of map area on some radars. One line
fixes it (`devIndicators: false` in `next.config.ts`; the `appIsrStatus` and
`buildActivity` sub-options were removed in Next 16). Development only — it never
reaches the deployed app, which is why it is not urgent.

## kubernetes_* resources are deprecated in midgard

`terraform validate` reports 17 `Deprecated Resource` warnings across brain,
cs2-analyzer, cs2-playbook, log-shipper and palworld: the provider wants the `_v1`
names. Not a rename — a resource's type is part of its address in state, and the
provider does not implement `MoveResourceState`, so `moved` blocks fail outright
(mano1233/midgard#105 proved this and was closed). The only route is `terraform state
mv` against the Terraform Cloud state, which is real risk for a cosmetic gain. The
unversioned names are deprecated, not removed.

## No guard against a save that empties a strat

The editor autosaves whatever the client holds, and the server deletes any marker the
client did not send. A wrong client state therefore destroys markers. Revisions are
written before each save so it is recoverable, but nothing prevents it. A guard was
considered and rejected: clearing every marker is a legitimate edit, and refusing it
would block real work to prevent a hypothetical.

## Deployed image lags the repo

`playbook.meerkat-cirius.ts.net` runs 0.5.0, which predates write-once positions and
capturing a complete util at creation. Shipping needs a `VERSION` bump here and a
matching `image_tag` in `terraform/modules/cs2-playbook/variables.tf`.

## Radar images are uploaded by hand

`scripts/` has no uploader; the images went into R2 from a one-off script using
credentials read out of the cluster secret. Adding a map today means repeating that by
hand. Worth a committed script once a second map needs adding.
