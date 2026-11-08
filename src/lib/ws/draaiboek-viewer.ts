/**
 * Who looks at the printed run sheet decides which fields are fetched at
 * all (feedback 13.5): the data layer asks only for what this viewer may see,
 * so a hidden field never leaves the database. Free of server imports so it
 * is unit tested.
 */

export type DraaiboekViewer = "admin" | "couple" | "student";

export interface ViewerFields {
  /** Phone numbers (and addresses, e-mail) of guests. */
  guestContact: boolean;
  /** Phone and e-mail of suppliers: third parties' contact details. */
  supplierContact: boolean;
  /** Allergies and diets per guest: needed on the day itself, so for everyone. */
  diet: boolean;
  /** Speeches (feedback 12): Sabine only, a speech can be a surprise. */
  speeches: boolean;
  /** Costs and budget. The print shows none; kept explicit so it stays that way. */
  costs: boolean;
  /** Print or download button, and printing straight away (?print=1). */
  print: boolean;
  /** A choice of chapters through the link (?tabs=); the student always gets the whole run sheet. */
  chooseTabs: boolean;
  /** Links into the couple's portal (the "Terug" button to /k/...). */
  portalLinks: boolean;
}

export function viewerFields(viewer: DraaiboekViewer): ViewerFields {
  switch (viewer) {
    case "admin":
      return { guestContact: true, supplierContact: true, diet: true, speeches: true, costs: true, print: true, chooseTabs: true, portalLinks: true };
    case "couple":
      return { guestContact: true, supplierContact: true, diet: true, speeches: false, costs: true, print: true, chooseTabs: true, portalLinks: true };
    case "student":
      return { guestContact: false, supplierContact: false, diet: true, speeches: false, costs: false, print: false, chooseTabs: false, portalLinks: false };
  }
}

/** The guest columns to select: contact columns become empty strings when the viewer may not see them. */
export function guestContactColumns(fields: Pick<ViewerFields, "guestContact">, alias = "g"): string {
  return fields.guestContact ? `${alias}.phone` : `''::text as phone`;
}

/** The supplier columns to select, the same way. */
export function supplierContactColumns(fields: Pick<ViewerFields, "supplierContact">, alias = "s"): string {
  return fields.supplierContact ? `${alias}.phone, ${alias}.email` : `''::text as phone, ''::text as email`;
}

/** The headings of the guest table on paper. */
export function guestHeadings(fields: Pick<ViewerFields, "guestContact">): string[] {
  return ["Nr.", "Aanwezig", "Naam", "Relatie", ...(fields.guestContact ? ["Mobiel"] : []), "Allergieën / dieet", "Deel van de dag"];
}

/** The headings of the supplier table on paper. */
export function supplierHeadings(fields: Pick<ViewerFields, "supplierContact">): string[] {
  return ["Categorie", "Leverancier", "Contact", ...(fields.supplierContact ? ["Telefoon", "E-mail"] : []), "Aanwezig"];
}
