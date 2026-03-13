/**
 * @integram/core-data-service - V2 Роуты онтологии (#185)
 */
import { Router } from 'express';

export function createOntologyRoutes(services, options = {}) {
  const router = Router();
  const { ontologyService } = services;
  const logger = options.logger || console;
  const wrap = (data, meta = {}) => ({ success: true, data, meta: { timestamp: new Date().toISOString(), ...meta } });
  const wrapErr = (error, code = 'ERROR') => ({ success: false, error: { code, message: error.message || 'Ошибка' }, meta: { timestamp: new Date().toISOString() } });

  router.get('/databases/:database/ontology', async (req, res) => {
    try { res.json(wrap(await ontologyService.getOntology(req.params.database))); }
    catch (e) { logger.error('GET ontology failed', { error: e.message }); res.status(500).json(wrapErr(e)); }
  });

  router.get('/databases/:database/ontology/jsonld', async (req, res) => {
    try { res.set('Content-Type', 'application/ld+json'); res.json(await ontologyService.exportJsonLd(req.params.database)); }
    catch (e) { logger.error('GET JSON-LD failed', { error: e.message }); res.status(500).json(wrapErr(e)); }
  });

  router.get('/databases/:database/ontology/owl', async (req, res) => {
    try { res.set('Content-Type', 'application/rdf+xml'); res.send(await ontologyService.exportOwl(req.params.database)); }
    catch (e) { logger.error('GET OWL failed', { error: e.message }); res.status(500).json(wrapErr(e)); }
  });

  router.post('/databases/:database/ontology/import', async (req, res) => {
    try {
      if (!req.body?.classes) return res.status(400).json(wrapErr({ message: 'Поле classes обязательно' }, 'VALIDATION'));
      res.status(201).json(wrap(await ontologyService.importOntology(req.params.database, req.body)));
    } catch (e) { logger.error('POST import failed', { error: e.message }); res.status(400).json(wrapErr(e, 'VALIDATION')); }
  });

  router.post('/databases/:database/ontology/sparql', async (req, res) => {
    try {
      if (!req.body?.query) return res.status(400).json(wrapErr({ message: 'Поле query обязательно' }, 'VALIDATION'));
      res.json(wrap(await ontologyService.getSPARQL(req.params.database, req.body.query)));
    } catch (e) { logger.error('POST SPARQL failed', { error: e.message }); res.status(e.message.includes('Поддерживается') ? 400 : 500).json(wrapErr(e)); }
  });

  return router;
}
export default createOntologyRoutes;
