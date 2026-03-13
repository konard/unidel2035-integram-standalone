/**
 * @integram/core-data-service - OntologyService
 * Онтологический слой (#185).
 */

const BASE_URI = 'https://integram.rf/ontology';
const NAMESPACES = { rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#', owl: 'http://www.w3.org/2002/07/owl#', xsd: 'http://www.w3.org/2001/XMLSchema#', igr: `${BASE_URI}#` };
const XSD_TYPE_MAP = { 1: 'xsd:string', 2: 'xsd:integer', 3: 'xsd:decimal', 4: 'xsd:date', 5: 'xsd:dateTime', 6: 'xsd:boolean', 7: 'xsd:string', 8: 'xsd:anyURI', 9: 'xsd:string', 10: 'xsd:string' };

export class OntologyService {
  constructor(databaseService, deps = {}, options = {}) {
    this.db = databaseService;
    this.typeService = deps.typeService;
    this.objectService = deps.objectService;
    this.logger = options.logger || console;
  }

  async getOntology(db) {
    const types = await this.typeService.getAllTypes(db, { includeSystem: false });
    const classes = [], properties = [], relationships = [];
    for (const type of types) {
      const classUri = `${BASE_URI}#${this._safeName(type.val)}`;
      classes.push({ uri: classUri, label: type.val, typeId: type.id, comment: `Тип Integram #${type.id}` });
      let requisites = [];
      try { const schema = await this.typeService.getSchema(db, type.id); requisites = schema.requisites || []; } catch (e) {}
      for (const req of requisites) {
        const propUri = `${BASE_URI}#${this._safeName(type.val)}_${this._safeName(req.val)}`;
        if (req.t && req.t >= 100) {
          relationships.push({ uri: propUri, label: req.val, domain: classUri, range: `${BASE_URI}#type_${req.t}`, requisiteId: req.id });
        } else {
          properties.push({ uri: propUri, label: req.val, domain: classUri, range: XSD_TYPE_MAP[req.t] || 'xsd:string', requisiteId: req.id });
        }
      }
    }
    return { baseUri: BASE_URI, namespaces: NAMESPACES, classes, properties, relationships, stats: { classCount: classes.length, propertyCount: properties.length, relationshipCount: relationships.length } };
  }

  async exportJsonLd(db) {
    const ont = await this.getOntology(db);
    const graph = [];
    for (const c of ont.classes) graph.push({ '@id': c.uri, '@type': 'owl:Class', 'rdfs:label': c.label, 'rdfs:comment': c.comment });
    for (const p of ont.properties) graph.push({ '@id': p.uri, '@type': 'owl:DatatypeProperty', 'rdfs:label': p.label, 'rdfs:domain': { '@id': p.domain }, 'rdfs:range': { '@id': p.range } });
    for (const r of ont.relationships) graph.push({ '@id': r.uri, '@type': 'owl:ObjectProperty', 'rdfs:label': r.label, 'rdfs:domain': { '@id': r.domain }, 'rdfs:range': { '@id': r.range } });
    return { '@context': { rdf: NAMESPACES.rdf, rdfs: NAMESPACES.rdfs, owl: NAMESPACES.owl, xsd: NAMESPACES.xsd, igr: NAMESPACES.igr }, '@graph': graph };
  }

  async exportOwl(db) {
    const ont = await this.getOntology(db);
    const l = ['<?xml version="1.0" encoding="UTF-8"?>', '<rdf:RDF'];
    for (const [p, u] of Object.entries(NAMESPACES)) l.push(`  xmlns:${p}="${u}"`);
    l.push('>', `  <owl:Ontology rdf:about="${BASE_URI}">`, `    <rdfs:label>Integram Ontology — ${db}</rdfs:label>`, '  </owl:Ontology>');
    for (const c of ont.classes) { l.push(`  <owl:Class rdf:about="${c.uri}">`, `    <rdfs:label>${this._escapeXml(c.label)}</rdfs:label>`); if (c.comment) l.push(`    <rdfs:comment>${this._escapeXml(c.comment)}</rdfs:comment>`); l.push('  </owl:Class>'); }
    for (const p of ont.properties) l.push(`  <owl:DatatypeProperty rdf:about="${p.uri}">`, `    <rdfs:label>${this._escapeXml(p.label)}</rdfs:label>`, `    <rdfs:domain rdf:resource="${p.domain}"/>`, `    <rdfs:range rdf:resource="${NAMESPACES.xsd}${p.range.replace('xsd:', '')}"/>`, '  </owl:DatatypeProperty>');
    for (const r of ont.relationships) l.push(`  <owl:ObjectProperty rdf:about="${r.uri}">`, `    <rdfs:label>${this._escapeXml(r.label)}</rdfs:label>`, `    <rdfs:domain rdf:resource="${r.domain}"/>`, `    <rdfs:range rdf:resource="${r.range}"/>`, '  </owl:ObjectProperty>');
    l.push('</rdf:RDF>');
    return l.join('\n');
  }

  async importOntology(db, data) {
    if (!data || !Array.isArray(data.classes)) throw new Error('ontologyData.classes должен быть массивом');
    const created = [], errors = [];
    for (const cls of data.classes) {
      try {
        const name = cls.name || cls.label;
        if (!name) { errors.push({ class: cls, error: 'Отсутствует имя класса' }); continue; }
        const type = await this.typeService.createType(db, { name, requisites: (cls.properties || []).map(p => ({ name: p.name || p.label, type: this._xsdToIntegram(p.range || p.type) })) });
        created.push({ name, typeId: type.id });
      } catch (e) { errors.push({ class: cls.name || cls.label, error: e.message }); }
    }
    return { imported: created.length, created, errors };
  }

  async mapToSchema(db, ontologyUri) {
    const types = await this.typeService.getAllTypes(db);
    const mappings = types.map(t => ({ localTypeId: t.id, localTypeName: t.val, ontologyUri: `${ontologyUri}#${this._safeName(t.val)}` }));
    return { ontologyUri, database: db, mappings, count: mappings.length };
  }

  async getSPARQL(db, query) {
    if (!query || typeof query !== 'string') throw new Error('SPARQL-запрос обязателен');
    const m = query.trim().match(/SELECT\s+([\s\S]*?)\s+WHERE\s*\{([\s\S]*?)\}/i);
    if (!m) throw new Error('Поддерживается только SELECT ... WHERE { ... }');
    const vars = m[1].trim().split(/\s+/), where = m[2].trim();
    const tp = where.match(/\?\w+\s+(?:a|rdf:type)\s+(?:igr:)?(\w+)/i);
    if (!tp) { const types = await this.typeService.getAllTypes(db); return { vars, bindings: types.map(t => ({ '?s': `${BASE_URI}#${this._safeName(t.val)}`, '?label': t.val, '?type': 'owl:Class' })), count: types.length }; }
    const types = await this.typeService.getAllTypes(db);
    const matched = types.find(t => this._safeName(t.val).toLowerCase() === tp[1].toLowerCase() || t.val.toLowerCase() === tp[1].toLowerCase());
    if (!matched) return { vars, bindings: [], count: 0 };
    let schema = null; try { schema = await this.typeService.getSchema(db, matched.id); } catch (e) {}
    return { vars, bindings: [{ '?s': `${BASE_URI}#${this._safeName(matched.val)}`, '?label': matched.val, '?type': 'owl:Class', '?typeId': matched.id, '?requisites': (schema?.requisites || []).length }], count: 1 };
  }

  _safeName(n) { if (!n) return 'unknown'; return n.replace(/\s+/g, '_').replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '').replace(/^(\d)/, '_$1'); }
  _escapeXml(s) { if (!s) return ''; return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  _xsdToIntegram(t) { const m = { 'xsd:string': 1, 'xsd:integer': 2, 'xsd:decimal': 3, 'xsd:date': 4, 'xsd:dateTime': 5, 'xsd:boolean': 6, 'xsd:anyURI': 8, 'string': 1, 'integer': 2, 'number': 3, 'date': 4, 'boolean': 6 }; return m[t] || 1; }
}

export default OntologyService;
