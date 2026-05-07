/**
 * categories.js — Categories page and category detail dashboard
 */

'use strict';

const Categories = (() => {

  let editingCategoryId = null;

  // ---- Render categories grid ----
  const render = () => {
    const list = document.getElementById('categories-list');
    if (!list) return;
    list.innerHTML = '';

    const cats = DB.getCategories().sort((a, b) => a.name.localeCompare(b.name));
    const modules = DB.getModules();

    // "Other" tile for uncategorized modules
    const uncategorized = modules.filter(m => !m.categoryId);
    if (uncategorized.length > 0) {
      list.appendChild(buildCategoryTile({
        id: '__other__',
        name: 'Other',
        description: 'Uncategorized modules',
        colour: '#4d546a',
        notes: '',
      }, uncategorized.length));
    }

    cats.forEach(cat => {
      const count = modules.filter(m => m.categoryId === cat.id).length;
      list.appendChild(buildCategoryTile(cat, count));
    });

    if (!cats.length && !uncategorized.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128193;</div><p>No categories yet.<br>Tap + to create one!</p></div>';
    }
  };

  const buildCategoryTile = (cat, moduleCount) => {
    const tile = document.createElement('div');
    tile.className = 'category-tile';
    tile.innerHTML = `
      <div class="category-tile-accent" style="background:${cat.colour}"></div>
      <div class="category-tile-info">
        <div class="category-tile-name">${UI.escHtml(cat.name)}</div>
        <div class="category-tile-meta">${moduleCount} module${moduleCount !== 1 ? 's' : ''}${cat.description ? ' &middot; ' + UI.escHtml(cat.description) : ''}</div>
      </div>
      ${cat.id !== '__other__' ? '<button class="icon-btn category-edit-btn" style="color:var(--text-muted);font-size:13px">&#9998;</button>' : ''}
    `;
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.category-edit-btn')) {
        openEditCategory(cat.id);
        return;
      }
      openCategoryDetail(cat.id);
    });
    return tile;
  };

  // ---- Category detail dashboard ----
  const openCategoryDetail = (catId) => {
    const isOther = catId === '__other__';
    const cat = isOther ? { name: 'Other', colour: '#4d546a' } : DB.getCategoryById(catId);
    if (!cat) return;

    document.getElementById('category-detail-title').textContent = cat.name;
    document.getElementById('category-detail-title').style.color = cat.colour;

    const body = document.getElementById('category-detail-body');
    body.innerHTML = '';

    const modules = isOther
      ? DB.getModules().filter(m => !m.categoryId)
      : DB.getModules().filter(m => m.categoryId === catId);

    if (!modules.length) {
      body.innerHTML = '<div class="dash-none-msg">No modules in this category.</div>';
    } else {
      modules.sort((a, b) => a.name.localeCompare(b.name)).forEach(mod => {
        const stats = DB.getModuleCompletionStats(mod.id);
        const stacks = DB.getStacksByModule(mod.id);
        const row = document.createElement('div');
        row.className = 'all-module-row';
        row.innerHTML = `
          <div class="all-module-row-accent" style="background:${mod.colour}"></div>
          <div class="all-module-row-info">
            <div class="all-module-row-name">${UI.escHtml(mod.name)}</div>
            <div class="all-module-row-meta">${Scheduler.freqLabel(mod)} &middot; ${stacks.length} stack${stacks.length !== 1 ? 's' : ''} &middot; ${stats.total} task${stats.total !== 1 ? 's' : ''}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            ${!mod.active ? '<span style="font-size:10px;padding:2px 8px;background:var(--rose-dim);color:var(--rose);border-radius:999px;">Stopped</span>' : ''}
            <span class="all-module-row-badge">${stats.done}/${stats.total}</span>
          </div>
        `;
        row.addEventListener('click', () => Modals.openModuleDetail(mod.id));
        body.appendChild(row);
      });
    }

    Modals.openModal('modal-category-detail');
  };

  // ---- Category editor ----
  let catColourGetter = null;

  const openEditCategory = (catId = null) => {
    editingCategoryId = catId;
    const cat = catId ? DB.getCategoryById(catId) : null;

    document.getElementById('edit-category-title').textContent = cat ? 'Edit Category' : 'New Category';
    document.getElementById('cat-name').value = cat ? cat.name : '';
    document.getElementById('cat-desc').value = cat ? cat.description : '';
    document.getElementById('cat-notes').value = cat ? cat.notes : '';

    catColourGetter = UI.renderColourPicker('cat-colour-picker', cat ? cat.colour : UI.COLOURS[0]);

    // Show/hide delete button
    document.getElementById('delete-category-btn').style.display = cat ? '' : 'none';

    Modals.openModal('modal-edit-category');
    setTimeout(() => document.getElementById('cat-name').focus(), 100);
  };

  const saveCategory = () => {
    const name = document.getElementById('cat-name').value.trim();
    if (!name) { UI.toast('Please enter a name'); return; }

    const colourEl = document.querySelector('#cat-colour-picker .colour-swatch.selected');
    const colour = colourEl ? colourEl.dataset.colour || colourEl.style.background : UI.COLOURS[0];

    const data = {
      name,
      description: document.getElementById('cat-desc').value.trim(),
      colour,
      notes: document.getElementById('cat-notes').value.trim(),
    };

    if (editingCategoryId) {
      DB.updateCategory(editingCategoryId, data);
      UI.toast('Category updated');
    } else {
      DB.addCategory(data);
      UI.toast('Category created');
    }

    Modals.closeModal('modal-edit-category');
    render();
  };

  const deleteCategory = async () => {
    if (!editingCategoryId) return;
    const cat = DB.getCategoryById(editingCategoryId);
    const ok = await UI.confirm('Delete Category', `Delete "${cat?.name}"? Modules will be moved to "Other".`);
    if (!ok) return;
    DB.deleteCategory(editingCategoryId);
    Modals.closeModal('modal-edit-category');
    UI.toast('Category deleted');
    render();
  };

  // ---- Init ----
  const init = () => {
    document.getElementById('save-category-btn').addEventListener('click', saveCategory);
    document.getElementById('delete-category-btn').addEventListener('click', deleteCategory);

    // Backdrop close
    ['modal-edit-category', 'modal-category-detail'].forEach(id => {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.querySelector('.modal-backdrop').addEventListener('click', () => Modals.closeModal(id));
      modal.querySelectorAll('.modal-close').forEach(btn =>
        btn.addEventListener('click', () => Modals.closeModal(id))
      );
    });
  };

  return { render, init, openEditCategory, openCategoryDetail };
})();
