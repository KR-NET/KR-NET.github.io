export const BLOCK_TITLE_MAX = 100;
export const BLOCK_DESC_MAX = 400;
export const BLOCK_TITLE_COUNTER_THRESHOLD = 80;
export const BLOCK_DESC_COUNTER_THRESHOLD = 340;

export function truncateBlockTitle(value) {
  return String(value ?? '').slice(0, BLOCK_TITLE_MAX);
}

export function truncateBlockDesc(value) {
  return String(value ?? '').slice(0, BLOCK_DESC_MAX);
}

function hasBlockTextField(value) {
  return String(value ?? '').trim().length > 0;
}

/** True when block has no title, desc, or link (carousel: every slide empty). */
export function isBlockEmptyForGlobalPublish(block) {
  if (!block) return true;
  if (block.type === 'carousel') {
    const slides = block.slides || [];
    if (!slides.length) return true;
    return slides.every(
      (s) =>
        !hasBlockTextField(s?.title) &&
        !hasBlockTextField(s?.desc) &&
        !hasBlockTextField(s?.link)
    );
  }
  return (
    !hasBlockTextField(block.title) &&
    !hasBlockTextField(block.desc) &&
    !hasBlockTextField(block.link)
  );
}

export function applyBlockTitleValue(input, value) {
  if (!input) return '';
  const v = truncateBlockTitle(value);
  input.value = v;
  return v;
}

export function applyBlockDescValue(input, value) {
  if (!input) return '';
  const v = truncateBlockDesc(value);
  input.value = v;
  return v;
}

export function updateBlockTitleCounter(input, counterEl) {
  if (!counterEl) return;
  const len = (input?.value || '').length;
  if (len > BLOCK_TITLE_COUNTER_THRESHOLD) {
    counterEl.textContent = `${len}/${BLOCK_TITLE_MAX}`;
    counterEl.style.display = '';
  } else {
    counterEl.textContent = '';
    counterEl.style.display = 'none';
  }
}

export function updateBlockDescCounter(input, counterEl) {
  if (!counterEl) return;
  const len = (input?.value || '').length;
  if (len > BLOCK_DESC_COUNTER_THRESHOLD) {
    counterEl.textContent = `${len}/${BLOCK_DESC_MAX}`;
    counterEl.style.display = '';
  } else {
    counterEl.textContent = '';
    counterEl.style.display = 'none';
  }
}

export function initBlockTitleField(input, counterEl, onInput) {
  if (!input) return;
  input.maxLength = BLOCK_TITLE_MAX;
  const sync = () => {
    if (input.value.length > BLOCK_TITLE_MAX) {
      input.value = input.value.slice(0, BLOCK_TITLE_MAX);
    }
    updateBlockTitleCounter(input, counterEl);
    if (onInput) onInput();
  };
  input.addEventListener('input', sync);
  sync();
}

export function initBlockDescField(input, counterEl, onInput) {
  if (!input) return;
  input.maxLength = BLOCK_DESC_MAX;
  const sync = () => {
    if (input.value.length > BLOCK_DESC_MAX) {
      input.value = input.value.slice(0, BLOCK_DESC_MAX);
    }
    updateBlockDescCounter(input, counterEl);
    if (onInput) onInput();
  };
  input.addEventListener('input', sync);
  sync();
}

export function initBlockSlideTextFields(container, slide, onUpdate) {
  const titleInput = container.querySelector('.carousel-slide-title');
  const descInput = container.querySelector('.carousel-slide-desc');
  const titleCounter = container.querySelector('.carousel-slide-title-count');
  const descCounter = container.querySelector('.carousel-slide-desc-count');

  initBlockTitleField(titleInput, titleCounter, () => {
    slide.title = titleInput.value;
    if (onUpdate) onUpdate();
  });
  initBlockDescField(descInput, descCounter, () => {
    slide.desc = descInput.value;
    if (onUpdate) onUpdate();
  });
}
