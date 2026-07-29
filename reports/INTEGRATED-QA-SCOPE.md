# Integrated QA scope

This branch is one connected BusCommand change set. Test datasets are external inputs only and are not copied into production source or build output.

Validated flow: tenant role access -> driver import/activation -> group assignment -> monthly schedule import -> daily plan derivation -> operational resolution -> audit-safe server writes.

The package importer fails closed on partial input, unknown drivers, duplicate driver/day assignments, mixed months, unsupported formats, and dispatcher attempts to import driver accounts.
