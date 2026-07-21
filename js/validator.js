export class Validator {
  constructor(targetFields, requiredFields) {
    this.targetFields = targetFields;
    this.requiredFields = requiredFields || [];
  }

  validateRow(row, mapping) {
    const errors = {};
    // Check required
    for (const field of this.requiredFields) {
      if (!row[field] || row[field].toString().trim() === '') {
        errors[field] = 'Wajib diisi';
      }
    }
    // Type checks (simple)
    // Duplicate detection can be done outside
    return errors;
  }

  validateAll(rows, mapping) {
    const rowErrors = rows.map((row, idx) => ({
      index: idx,
      errors: this.validateRow(row, mapping)
    }));
    return rowErrors;
  }
}