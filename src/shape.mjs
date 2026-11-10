// Deliberately limited to the supported object-schema subset; no external loading.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : object(value) ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
function jsonValue(value, active = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!value || typeof value !== 'object' || active.has(value)) return false;
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  if (Array.isArray(value) && (Object.keys(value).length !== value.length || Object.keys(value).some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))) return false;
  active.add(value);
  const valid = Object.values(value).every(item => jsonValue(item, active));
  active.delete(value);
  return valid;
}
function referenceTarget(ref, root) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined;
  return ref.slice(2).split('/').reduce((item, part) => {
    if (/~(?![01])/.test(part)) return undefined;
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    return item && typeof item === 'object' && Object.hasOwn(item, key) ? item[key] : undefined;
  }, root);
}
export function shapeErrors(value, rule, root = rule, path = '$') {
  const errors = schemaErrors(rule, root);
  if (errors.length) return errors;
  return jsonValue(value) ? validateShape(value, rule, root, path) : [`${path}: invalid JSON instance`];
}

function validateShape(value, rule, root, path) {
  if (rule.$ref) {
    if (!rule.$ref.startsWith('#/')) return [`${path}: external schema references unsupported`];
    const target = referenceTarget(rule.$ref, root);
    return target ? validateShape(value, target, root, path) : [`${path}: unresolved schema reference`];
  }
  const errors = [];
  const fail = message => errors.push(`${path}: ${message}`);
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (rule.type && ![rule.type].flat().includes(type)) return [`${path}: incorrect type`];
  if ('const' in rule && canonical(value) !== canonical(rule.const)) fail('incorrect constant');
  if (rule.enum && !rule.enum.some(item => canonical(item) === canonical(value))) fail('value outside enum');
  if (type === 'string') {
    if (rule.minLength && value.trim().length < rule.minLength) fail('empty text');
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail('invalid format');
    if (rule.format === 'date-time' && !validTime(value)) fail('invalid timestamp');
  }
  if (type === 'number') {
    if (!Number.isFinite(value)) fail('nonfinite number');
    if (rule.minimum !== undefined && value < rule.minimum) fail('below minimum');
    if (rule.maximum !== undefined && value > rule.maximum) fail('above maximum');
  }
  if (type === 'array') {
    if (rule.minItems !== undefined && value.length < rule.minItems) fail('too few entries');
    if (rule.maxItems !== undefined && value.length > rule.maxItems) fail('too many entries');
    if (rule.uniqueItems && new Set(value.map(canonical)).size !== value.length) fail('duplicate entries');
    if (rule.items) value.forEach((item, i) => errors.push(...validateShape(item, rule.items, root, `${path}[${i}]`)));
  }
  if (type === 'object') {
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) fail(`missing field ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(rule.properties ?? {}, key)) errors.push(...validateShape(item, rule.properties[key], root, `${path}.${key}`));
      else if (rule.additionalProperties === false) fail('unexpected field');
      else if (typeof rule.additionalProperties === 'object') errors.push(...validateShape(item, rule.additionalProperties, root, `${path}.*`));
    }
  }
  for (const subrule of rule.allOf ?? []) errors.push(...validateShape(value, subrule, root, path));
  if (rule.if) {
    const branch = validateShape(value, rule.if, root, path).length ? rule.else : rule.then;
    if (branch) errors.push(...validateShape(value, branch, root, path));
  }
  return errors;
}

export function validTime(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?Z$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const parsed = new Date(value);
  return parsed.getUTCFullYear() === +match[1] && parsed.getUTCMonth() + 1 === +match[2]
    && parsed.getUTCDate() === +match[3] && +match[4] < 24 && +match[5] < 60 && +match[6] < 60;
}

// Inspect keyword values and every branch before interpreting any instance.
// Boolean schemas and recursive references are outside this bounded subset.
export function schemaErrors(rule, root = rule) {
  const allowed = new Set(['$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'required', 'properties', 'additionalProperties',
    'const', 'enum', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'pattern', 'format', 'minimum', 'maximum', 'allOf', 'if', 'then', 'else']);
  const types = new Set(['null', 'boolean', 'object', 'array', 'number', 'string']);
  const errors = [], visited = new WeakSet(), active = new WeakSet();
  const invalid = key => errors.push('Invalid bundled schema value: ' + key);
  const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string') && new Set(value).size === value.length;
  function inspect(node) {
    if (!object(node)) { errors.push('Unsupported or invalid bundled schema'); return; }
    if (active.has(node)) { errors.push('Recursive bundled schema unsupported'); return; }
    if (visited.has(node)) return;
    visited.add(node); active.add(node);
    for (const key of Object.keys(node)) if (!allowed.has(key)) errors.push('Unsupported bundled schema keyword');
    for (const key of ['$schema', '$id', 'title', 'description']) if (Object.hasOwn(node, key) && typeof node[key] !== 'string') invalid(key);
    if (Object.hasOwn(node, 'type')) {
      const declared = Array.isArray(node.type) ? node.type : [node.type];
      if (!declared.length || !strings(declared) || declared.some(type => !types.has(type))) invalid('type');
    }
    if (Object.hasOwn(node, 'required') && !strings(node.required)) invalid('required');
    if (Object.hasOwn(node, 'const') && !jsonValue(node.const)) invalid('const');
    if (Object.hasOwn(node, 'enum') && (!Array.isArray(node.enum) || !node.enum.length || !jsonValue(node.enum))) invalid('enum');
    for (const key of ['minItems', 'maxItems', 'minLength']) if (Object.hasOwn(node, key) && (!Number.isSafeInteger(node[key]) || node[key] < 0)) invalid(key);
    for (const key of ['minimum', 'maximum']) if (Object.hasOwn(node, key) && (typeof node[key] !== 'number' || !Number.isFinite(node[key]))) invalid(key);
    if (Object.hasOwn(node, 'uniqueItems') && typeof node.uniqueItems !== 'boolean') invalid('uniqueItems');
    if (Object.hasOwn(node, 'pattern')) {
      if (typeof node.pattern !== 'string') invalid('pattern');
      else try { new RegExp(node.pattern); } catch { invalid('pattern'); }
    }
    if (Object.hasOwn(node, 'format') && node.format !== 'date-time') errors.push('Unsupported bundled schema format');
    for (const key of ['properties', '$defs']) if (Object.hasOwn(node, key)) {
      if (!object(node[key])) invalid(key);
      else for (const child of Object.values(node[key])) inspect(child);
    }
    if (Object.hasOwn(node, 'allOf')) {
      if (!Array.isArray(node.allOf) || !node.allOf.length) invalid('allOf');
      else node.allOf.forEach(inspect);
    }
    for (const key of ['items', 'if', 'then', 'else']) if (Object.hasOwn(node, key)) inspect(node[key]);
    if (Object.hasOwn(node, 'additionalProperties') && typeof node.additionalProperties !== 'boolean') inspect(node.additionalProperties);
    if (Object.hasOwn(node, '$ref')) {
      if (Object.keys(node).some(key => !['$ref', 'title', 'description'].includes(key))) errors.push('Unsupported schema reference siblings');
      const target = referenceTarget(node.$ref, root);
      if (target === undefined) errors.push('Unresolved bundled schema reference');
      else inspect(target);
    }
    active.delete(node);
  }
  inspect(rule);
  return [...new Set(errors)];
}
