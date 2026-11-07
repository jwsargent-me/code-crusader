// Deliberately limited to the keywords used by the bundled schemas.
// It is not a general JSON Schema implementation.
export function shapeErrors(value, rule, root = rule, path = '$') {
  if (rule.$ref) {
    if (!rule.$ref.startsWith('#/')) return [`${path}: external schema references unsupported`];
    const target = rule.$ref.slice(2).split('/').reduce((item, key) => item?.[key], root);
    return target ? shapeErrors(value, target, root, path) : [`${path}: unresolved schema reference`];
  }
  const errors = [];
  const fail = message => errors.push(`${path}: ${message}`);
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (rule.type && ![rule.type].flat().includes(type)) return [`${path}: incorrect type`];
  if ('const' in rule && JSON.stringify(value) !== JSON.stringify(rule.const)) fail('incorrect constant');
  if (rule.enum && !rule.enum.includes(value)) fail('value outside enum');
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
    if (rule.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) fail('duplicate entries');
    if (rule.items) value.forEach((item, i) => errors.push(...shapeErrors(item, rule.items, root, `${path}[${i}]`)));
  }
  if (type === 'object') {
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) fail(`missing field ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(rule.properties ?? {}, key)) errors.push(...shapeErrors(item, rule.properties[key], root, `${path}.${key}`));
      else if (rule.additionalProperties === false) fail('unexpected field');
      else if (typeof rule.additionalProperties === 'object') errors.push(...shapeErrors(item, rule.additionalProperties, root, `${path}.*`));
    }
  }
  for (const subrule of rule.allOf ?? []) errors.push(...shapeErrors(value, subrule, root, path));
  if (rule.if) {
    const branch = shapeErrors(value, rule.if, root, path).length ? rule.else : rule.then;
    if (branch) errors.push(...shapeErrors(value, branch, root, path));
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

// Fail closed when a bundled contract starts using a keyword we do not enforce.
export function schemaErrors(rule, root = rule) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return ['Invalid bundled schema'];
  const allowed = new Set(['$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'required', 'properties', 'additionalProperties',
    'const', 'enum', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'pattern', 'format', 'minimum', 'maximum', 'allOf', 'if', 'then', 'else']);
  const errors = Object.keys(rule).filter(key => !allowed.has(key)).map(() => 'Unsupported bundled schema keyword');
  if (rule.format && rule.format !== 'date-time') errors.push('Unsupported bundled schema format');
  if (rule.$ref) {
    if (Object.keys(rule).some(key => !['$ref', 'title', 'description'].includes(key))) errors.push('Unsupported schema reference siblings');
    if (!rule.$ref.startsWith('#/') || !rule.$ref.slice(2).split('/').reduce((item, key) => item?.[key], root)) errors.push('Unresolved bundled schema reference');
  }
  for (const child of [...Object.values(rule.properties ?? {}), ...Object.values(rule.$defs ?? {}), ...(rule.allOf ?? [])]) errors.push(...schemaErrors(child, root));
  for (const key of ['items', 'if', 'then', 'else', 'additionalProperties']) if (rule[key] && typeof rule[key] === 'object') errors.push(...schemaErrors(rule[key], root));
  return errors;
}
