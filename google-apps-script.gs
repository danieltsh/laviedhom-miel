/**
 * LAVIEDHOM — Script Google Apps Script pour enregistrer les demandes du site
 * dans votre Google Sheet privé (ex. Miel_Suivi_commandes_clients).
 *
 * Installation (2 minutes) :
 * 1. Ouvrez votre Google Sheet privé.
 * 2. Menu Extensions > Apps Script.
 * 3. Collez ce script et enregistrez.
 * 4. Cliquez sur Déployer > Nouveau déploiement > Application Web :
 *    - Exécuter en tant que : Moi
 *    - Qui a accès : Tout le monde
 * 5. Copiez l'URL de l'application Web dans LAVIEDHOM_CONFIG.sheetsWebhookUrl (app.js).
 */

const SHEET_NAME = 'Demandes site';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');

    // Validation serveur minimale
    if (!payload.prenom || !payload.nom || !payload.telephone || !payload.email) {
      return jsonResponse({ ok: false, error: 'Champs obligatoires manquants.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        'Date et heure',
        'Prénom',
        'Nom',
        'Téléphone',
        'E-mail',
        'Produit et format',
        'Quantité',
        'Statut de suivi',
        'Remarque',
      ]);
      sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    }

    sheet.appendRow([
      payload.dateHeure || new Date().toLocaleString('fr-BE'),
      String(payload.prenom).trim(),
      String(payload.nom).trim(),
      String(payload.telephone).trim(),
      String(payload.email).trim(),
      String(payload.produitFormat || 'Miel Ginger Laviedhom — 350 g').trim(),
      Number(payload.quantite) || 1,
      'Nouvelle demande',
      String(payload.remarque || '').trim(),
    ]);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
