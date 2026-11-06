// Monta a vitrine do template numa pasta: a casca (index.html, schema, guia, entrevista, ferramentas) mais o exemplo
// fictício (exemplo/plano.json, exemplo/sims/, exemplo/specs/). A mesma pasta serve para a prévia local e para
// publicar o artefato do template. O repositório é a fonte: nunca edite a pasta montada.
// Uso: node ferramentas/montar-exemplo.js <pasta-de-saida>
const fs = require('fs'), path = require('path');

function montarExemplo(saida) {
  const tpl = path.resolve(__dirname, '..');
  fs.rmSync(saida, { recursive: true, force: true });
  fs.mkdirSync(path.join(saida, 'ferramentas'), { recursive: true });
  for (const f of ['index.html', 'plano.schema.json', 'TEMPLATE.md', 'entrevista-pendencias.md']) fs.copyFileSync(path.join(tpl, f), path.join(saida, f));
  for (const f of fs.readdirSync(path.join(tpl, 'ferramentas')).filter((n) => n.endsWith('.js'))) {
    fs.copyFileSync(path.join(tpl, 'ferramentas', f), path.join(saida, 'ferramentas', f));
  }
  fs.cpSync(path.join(tpl, 'exemplo'), saida, { recursive: true });
  return saida;
}

module.exports = { montarExemplo };

if (require.main === module) {
  const saida = process.argv[2];
  if (!saida) { console.error('Uso: node ferramentas/montar-exemplo.js <pasta-de-saida>'); process.exit(2); }
  console.log('vitrine montada em', path.resolve(montarExemplo(path.resolve(saida))));
}
