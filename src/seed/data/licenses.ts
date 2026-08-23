import type { LicenseCategory } from "@/lib/domain/types";

export type LicenseSeed = {
  spdxId: string;
  name: string;
  category: LicenseCategory;
  osiApproved: boolean;
  /** Plain-English note shown in the UI so a non-lawyer knows why it matters. */
  obligation: string;
};

export const LICENSES: LicenseSeed[] = [
  {
    spdxId: "MIT",
    name: "MIT License",
    category: "permissive",
    osiApproved: true,
    obligation: "Keep the copyright notice. Nothing else.",
  },
  {
    spdxId: "Apache-2.0",
    name: "Apache License 2.0",
    category: "permissive",
    osiApproved: true,
    obligation: "Keep the notice and state your changes. Includes a patent grant.",
  },
  {
    spdxId: "BSD-3-Clause",
    name: "BSD 3-Clause",
    category: "permissive",
    osiApproved: true,
    obligation: "Keep the notice; do not use the authors' names to endorse.",
  },
  {
    spdxId: "BSD-2-Clause",
    name: "BSD 2-Clause",
    category: "permissive",
    osiApproved: true,
    obligation: "Keep the notice.",
  },
  {
    spdxId: "ISC",
    name: "ISC License",
    category: "permissive",
    osiApproved: true,
    obligation: "Keep the notice. Functionally equivalent to MIT.",
  },
  {
    spdxId: "0BSD",
    name: "BSD Zero Clause",
    category: "permissive",
    osiApproved: true,
    obligation: "None at all.",
  },
  {
    spdxId: "Python-2.0",
    name: "Python Software Foundation License 2.0",
    category: "permissive",
    osiApproved: true,
    obligation: "Keep the notice and a summary of changes.",
  },
  {
    spdxId: "Unlicense",
    name: "The Unlicense",
    category: "permissive",
    osiApproved: true,
    obligation: "Public domain dedication.",
  },
  {
    spdxId: "MPL-2.0",
    name: "Mozilla Public License 2.0",
    category: "weak-copyleft",
    osiApproved: true,
    obligation: "Modified MPL files must stay open. Your own files are unaffected.",
  },
  {
    spdxId: "LGPL-3.0-only",
    name: "GNU Lesser General Public License v3.0",
    category: "weak-copyleft",
    osiApproved: true,
    obligation: "Users must be able to relink against a modified version of the library.",
  },
  {
    spdxId: "EPL-2.0",
    name: "Eclipse Public License 2.0",
    category: "weak-copyleft",
    osiApproved: true,
    obligation: "Modifications to EPL files must be published under EPL.",
  },
  {
    spdxId: "GPL-3.0-only",
    name: "GNU General Public License v3.0",
    category: "strong-copyleft",
    osiApproved: true,
    obligation:
      "Distributing a product that links this normally requires releasing the whole work under GPL.",
  },
  {
    spdxId: "GPL-2.0-only",
    name: "GNU General Public License v2.0",
    category: "strong-copyleft",
    osiApproved: true,
    obligation:
      "Distributing a product that links this normally requires releasing the whole work under GPL.",
  },
  {
    spdxId: "AGPL-3.0-only",
    name: "GNU Affero General Public License v3.0",
    category: "network-copyleft",
    osiApproved: true,
    obligation:
      "Reaches software offered over a network, not just software you ship. The one that bites SaaS.",
  },
  {
    spdxId: "BUSL-1.1",
    name: "Business Source License 1.1",
    category: "source-available",
    osiApproved: false,
    obligation: "Source-available, not open source. Production use is restricted until the change date.",
  },
  {
    spdxId: "SSPL-1.0",
    name: "Server Side Public License",
    category: "source-available",
    osiApproved: false,
    obligation: "Offering the software as a service requires releasing your entire service stack.",
  },
  {
    spdxId: "NOASSERTION",
    name: "No licence declared",
    category: "unknown",
    osiApproved: false,
    obligation: "No grant of rights at all. Legally the most dangerous entry on this list.",
  },
];
