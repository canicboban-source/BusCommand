import test from "node:test";
import assert from "node:assert/strict";
import { getCompanyGroupsScope } from "../../js/admin/company-admin-groups-model.js";
import { getCompanyTeamScope } from "../../js/admin/company-admin-team-model.js";

test("CA group/team pickers see Firestore groups after companyId stamp", () => {
  // Groups stored under companies/{id}/groups often omit companyId in the doc body.
  // Loader must stamp it; otherwise production filters hide the line and CA cannot assign it.
  const rawFromFirestore = [{ id: "310", name: "Linie 310", active: true }];
  const stamped = rawFromFirestore.map(group => ({ ...group, companyId: "blaguss" }));

  const hidden = getCompanyGroupsScope({ groups: rawFromFirestore }, { companyId: "blaguss" }, false);
  assert.equal(hidden.groups.length, 0);

  const visible = getCompanyGroupsScope({ groups: stamped }, { companyId: "blaguss" }, false);
  assert.deepEqual(visible.groups.map(group => group.id), ["310"]);

  const team = getCompanyTeamScope({ groups: stamped, dispatchers: [] }, { companyId: "blaguss" }, false);
  assert.deepEqual(team.groups.map(group => group.id), ["310"]);
});
