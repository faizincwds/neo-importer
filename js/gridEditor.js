export class GridEditor {
  constructor(container, fields, data, mapping, callbacks = {}) {
    this.container = container;
    this.fields = fields;
    this.data = data; // array of objects
    this.mapping = mapping;
    this.callbacks = callbacks;
    this.selectedRows = new Set();
    this.render();
  }

  render() {
    let html = `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="bg-gray-200 dark:bg-gray-700">
      <th class="p-2"><input type="checkbox" id="select-all"></th>
      <th class="p-2">No</th>`;
    this.fields.forEach(f => html += `<th class="p-2">${f}</th>`);
    html += `<th class="p-2">Status</th><th class="p-2">Aksi</th></tr></thead><tbody>`;
    
    this.data.forEach((row, idx) => {
      const rowId = `row-${idx}`;
      html += `<tr id="${rowId}" class="border-b dark:border-gray-600">
        <td class="p-2"><input type="checkbox" class="row-checkbox" data-index="${idx}"></td>
        <td class="p-2">${idx+1}</td>`;
      this.fields.forEach(f => {
        const val = row[f] ?? '';
        const errorClass = row.__errors && row.__errors[f] ? 'error-cell' : '';
        html += `<td class="p-2 ${errorClass}" contenteditable="true" data-field="${f}" data-index="${idx}">${val}</td>`;
      });
      const status = row.status || '';
      html += `<td class="p-2">${status}</td>
        <td class="p-2"><button class="delete-row-btn bg-red-500 text-white px-2 py-1 rounded" data-index="${idx}">Hapus</button></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    this.container.innerHTML = html;
    this.attachEvents();
  }

  attachEvents() {
    this.container.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        if (e.target.checked) this.selectedRows.add(idx);
        else this.selectedRows.delete(idx);
        if (this.callbacks.onSelectionChange) this.callbacks.onSelectionChange(this.selectedRows);
      });
    });

    document.getElementById('select-all')?.addEventListener('change', (e) => {
      const checkboxes = this.container.querySelectorAll('.row-checkbox');
      checkboxes.forEach(cb => { cb.checked = e.target.checked; });
      this.selectedRows.clear();
      if (e.target.checked) this.data.forEach((_, i) => this.selectedRows.add(i));
      if (this.callbacks.onSelectionChange) this.callbacks.onSelectionChange(this.selectedRows);
    });

    this.container.querySelectorAll('.delete-row-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        this.data.splice(idx, 1);
        this.render();
        if (this.callbacks.onDelete) this.callbacks.onDelete(idx);
      });
    });

    // Cell editing
    this.container.querySelectorAll('[contenteditable="true"]').forEach(cell => {
      cell.addEventListener('blur', (e) => {
        const idx = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        this.data[idx][field] = e.target.innerText.trim();
        if (this.callbacks.onCellEdit) this.callbacks.onCellEdit(idx, field, this.data[idx][field]);
      });
    });
  }

  getData() { return this.data; }
  setData(newData) { this.data = newData; this.render(); }
}