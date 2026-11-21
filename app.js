/**
 * LAVIEDHOM — Logique de la landing page, tarification dégressive & commande WhatsApp
 *
 * CONFIGURATION À RENSEIGNER :
 * 1. whatsappPhone : votre numéro WhatsApp au format international sans "+" ni espaces
 *    Exemple Belgique : "32470123456"
 * 2. sheetsWebhookUrl : URL de déploiement de votre Google Apps Script (voir google-apps-script.gs)
 */
const LAVIEDHOM_CONFIG = {
  whatsappPhone: '32495195168',
  sheetsWebhookUrl: '',
  instagramUrl: 'https://www.instagram.com/laviedhom_miel/',
  unitPriceStandard: 20,
  unitPricePack: 15,
  packMinQuantity: 3,
  cooldownSeconds: 30,
  minFormTimeMs: 1500,
};

(function initLaviedhom() {
  'use strict';

  const pageLoadedAt = Date.now();
  const COOLDOWN_KEY = 'laviedhom_last_submit_ts';

  // Année du footer
  const yearEl = document.getElementById('yearNow');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // =========================================================================
  // Utilitaires tarification & WhatsApp
  // =========================================================================
  function getPricingForQty(qty) {
    const quantity = Math.max(1, Math.min(30, Math.round(Number(qty) || 1)));
    const isPack = quantity >= LAVIEDHOM_CONFIG.packMinQuantity;
    const unitPrice = isPack
      ? LAVIEDHOM_CONFIG.unitPricePack
      : LAVIEDHOM_CONFIG.unitPriceStandard;
    const total = quantity * unitPrice;
    const standardTotal = quantity * LAVIEDHOM_CONFIG.unitPriceStandard;
    const savings = Math.max(0, standardTotal - total);

    return { quantity, isPack, unitPrice, total, savings };
  }

  function formatEuro(amount) {
    return amount.toFixed(2).replace('.', ',') + ' €';
  }

  function buildQuickWhatsAppMessage(qty) {
    const p = getPricingForQty(qty);
    const potWord = p.quantity > 1 ? 'pots' : 'pot';
    const rateNote = p.isPack
      ? `${p.unitPrice} € par pot (tarif dès 3 pots — ${p.savings} € d’économie)`
      : `${p.unitPrice} € le pot`;

    return [
      'Bonjour LAVIEDHOM,',
      `Je souhaite commander ${p.quantity} ${potWord} de Miel Naturel au Gingembre (350 g).`,
      `• Tarif : ${rateNote}`,
      `• Total estimé : ${p.total} €`,
      '',
      'Pouvez-vous me confirmer la disponibilité et les modalités de remise ? Merci !',
    ].join('\n');
  }

  function buildFormWhatsAppMessage(data) {
    const p = getPricingForQty(data.quantity);
    const potWord = p.quantity > 1 ? 'pots' : 'pot';
    const lines = [
      'Bonjour LAVIEDHOM,',
      'Je souhaite faire une demande de commande :',
      '',
      `• Produit : ${data.product}`,
      `• Quantité : ${p.quantity} ${potWord}`,
      `• Tarif unitaire : ${p.unitPrice} € / pot${p.isPack ? ` (tarif dès 3 pots, -${p.savings} €)` : ''}`,
      `• Total estimé : ${formatEuro(p.total)}`,
      '',
      'Mes coordonnées :',
      `• Nom : ${data.firstName} ${data.lastName}`,
      `• Téléphone : ${data.phone}`,
      `• E-mail : ${data.email}`,
    ];
    if (data.deliveryNote) {
      lines.push(`• Remarque : ${data.deliveryNote}`);
    }
    lines.push('', 'Merci !');
    return lines.join('\n');
  }

  function buildWhatsAppUrl(message) {
    const cleanPhone = (LAVIEDHOM_CONFIG.whatsappPhone || '').replace(/[^\d]/g, '');
    const encoded = encodeURIComponent(message);
    return cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
  }

  // Initialise tous les CTA directs WhatsApp de la page
  document.querySelectorAll('.js-wa-direct').forEach((link) => {
    const qty = Number(link.dataset.waQty || 1);
    const message = buildQuickWhatsAppMessage(qty);
    link.setAttribute('href', buildWhatsAppUrl(message));
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  });

  // =========================================================================
  // 1. Navigation mobile
  // =========================================================================
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.setAttribute(
        'aria-label',
        isOpen ? 'Fermer le menu de navigation' : 'Ouvrir le menu de navigation'
      );
    });

    mainNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mainNav.classList.contains('is-open')) {
        mainNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.focus();
      }
    });
  }

  // =========================================================================
  // 2. Galerie photos produit
  // =========================================================================
  const mainProductImg = document.getElementById('mainProductImg');
  const thumbButtons = document.querySelectorAll('.thumb-btn');

  thumbButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextSrc = btn.dataset.img;
      const nextAlt = btn.dataset.alt || '';
      if (!mainProductImg || !nextSrc) return;

      thumbButtons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      mainProductImg.style.opacity = '0.4';
      window.setTimeout(() => {
        mainProductImg.src = nextSrc;
        mainProductImg.alt = nextAlt;
        mainProductImg.style.opacity = '1';
      }, 110);
    });
  });

  // =========================================================================
  // 3. Calcul dynamique de la quantité, du palier 3 pots & synchronisation
  // =========================================================================
  const productSelect = document.getElementById('productSelect');
  const quantityInput = document.getElementById('quantityInput');
  const qtyMinus = document.getElementById('qtyMinus');
  const qtyPlus = document.getElementById('qtyPlus');
  const totalAmountEl = document.getElementById('totalAmount');
  const unitRateLabel = document.getElementById('unitRateLabel');
  const tierHint = document.getElementById('tierHint');
  const quickQtyBtns = document.querySelectorAll('.quick-qty-btn');

  function syncQuantityUI(qty) {
    const p = getPricingForQty(qty);

    if (quantityInput) quantityInput.value = String(p.quantity);
    if (totalAmountEl) totalAmountEl.textContent = formatEuro(p.total);
    if (unitRateLabel) unitRateLabel.textContent = `Tarif appliqué : ${p.unitPrice} € / pot`;

    if (tierHint) {
      if (p.isPack) {
        tierHint.classList.add('is-applied');
        tierHint.textContent = `Tarif pack appliqué (15 € / pot) : vous économisez ${p.savings} € !`;
      } else {
        const missing = LAVIEDHOM_CONFIG.packMinQuantity - p.quantity;
        tierHint.classList.remove('is-applied');
        tierHint.textContent = `Ajoutez ${missing} pot${missing > 1 ? 's' : ''} pour passer à 15 € / pot (45 € les 3 au lieu de 60 €).`;
      }
    }

    quickQtyBtns.forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.qty) === p.quantity);
    });
  }

  quickQtyBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      syncQuantityUI(Number(btn.dataset.qty));
    });
  });

  document.querySelectorAll('.js-choose-qty').forEach((btn) => {
    btn.addEventListener('click', () => {
      syncQuantityUI(Number(btn.dataset.qty));
      document.getElementById('commander')?.scrollIntoView({ behavior: 'smooth' });
      window.setTimeout(() => {
        document.getElementById('firstName')?.focus();
      }, 350);
    });
  });

  if (qtyMinus && quantityInput) {
    qtyMinus.addEventListener('click', () => syncQuantityUI(Number(quantityInput.value) - 1));
  }

  if (qtyPlus && quantityInput) {
    qtyPlus.addEventListener('click', () => syncQuantityUI(Number(quantityInput.value) + 1));
  }

  if (quantityInput) {
    quantityInput.addEventListener('change', () => syncQuantityUI(quantityInput.value));
  }

  // Par défaut : 3 pots (met en valeur l'offre pack)
  syncQuantityUI(3);

  // =========================================================================
  // 4. Accordéon FAQ
  // =========================================================================
  document.querySelectorAll('.faq-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const panelId = trigger.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) return;

      const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
      trigger.setAttribute('aria-expanded', String(!isExpanded));
      panel.hidden = isExpanded;
    });
  });

  // =========================================================================
  // 5. Formulaire de demande, validation, anti-spam & WhatsApp
  // =========================================================================
  const orderForm = document.getElementById('orderForm');
  const submitBtn = document.getElementById('submitBtn');
  const statusBox = document.getElementById('statusBox');
  const statusTitle = document.getElementById('statusTitle');
  const statusMessage = document.getElementById('statusMessage');
  const whatsappPreview = document.getElementById('whatsappPreview');
  const statusActions = document.getElementById('statusActions');
  const openWhatsappBtn = document.getElementById('openWhatsappBtn');
  const copyMsgBtn = document.getElementById('copyMsgBtn');

  let lastBuiltMessage = '';
  let isSubmitting = false;

  function setFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errEl = document.getElementById(`err-${fieldId}`);
    if (input) {
      input.classList.toggle('is-invalid', Boolean(message));
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
    if (errEl) errEl.textContent = message || '';
  }

  function clearAllErrors() {
    ['quantity', 'firstName', 'lastName', 'phone', 'email', 'privacyConsent'].forEach((id) =>
      setFieldError(id, '')
    );
  }

  function validateForm(data) {
    clearAllErrors();
    let firstInvalidId = null;

    const fail = (id, msg) => {
      setFieldError(id, msg);
      if (!firstInvalidId) firstInvalidId = id;
    };

    if (!Number.isInteger(data.quantity) || data.quantity < 1 || data.quantity > 30) {
      fail('quantity', 'Veuillez choisir une quantité entre 1 et 30 pots.');
    }

    if (data.firstName.length < 2) {
      fail('firstName', 'Veuillez renseigner votre prénom.');
    }

    if (data.lastName.length < 2) {
      fail('lastName', 'Veuillez renseigner votre nom.');
    }

    const phoneDigits = data.phone.replace(/[^\d]/g, '');
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      fail('phone', 'Veuillez entrer un numéro de téléphone valide (ex. +32 470 12 34 56).');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(data.email)) {
      fail('email', 'Veuillez entrer une adresse e-mail valide.');
    }

    if (!data.privacyConsent) {
      fail('privacyConsent', 'Veuillez confirmer votre accord pour l’enregistrement de votre demande.');
    }

    if (firstInvalidId) {
      const targetId = firstInvalidId === 'quantity' ? 'quantityInput' : firstInvalidId;
      document.getElementById(targetId)?.focus();
      return false;
    }

    return true;
  }

  function showStatus({ type, title, message, waMessage = '', waUrl = '' }) {
    if (!statusBox || !statusTitle || !statusMessage) return;

    statusBox.hidden = false;
    statusBox.className = `status-box is-${type}`;
    statusTitle.textContent = title;
    statusMessage.textContent = message;

    if (waMessage && whatsappPreview && statusActions && openWhatsappBtn) {
      lastBuiltMessage = waMessage;
      whatsappPreview.textContent = waMessage;
      whatsappPreview.hidden = false;
      openWhatsappBtn.href = waUrl;
      statusActions.hidden = false;
    } else if (whatsappPreview && statusActions) {
      whatsappPreview.hidden = true;
      statusActions.hidden = true;
    }

    statusBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function saveToGoogleSheets(payload) {
    const url = (LAVIEDHOM_CONFIG.sheetsWebhookUrl || '').trim();
    if (!url) return { status: 'not_configured' };

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { status: 'saved' };
    } catch (error) {
      return { status: 'error', error };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  if (copyMsgBtn) {
    copyMsgBtn.addEventListener('click', async () => {
      if (!lastBuiltMessage) return;
      try {
        await navigator.clipboard.writeText(lastBuiltMessage);
        const original = copyMsgBtn.textContent;
        copyMsgBtn.textContent = 'Message copié';
        window.setTimeout(() => {
          copyMsgBtn.textContent = original;
        }, 2000);
      } catch {
        // Fallback silencieux
      }
    });
  }

  if (orderForm) {
    orderForm.querySelectorAll('input, select').forEach((field) => {
      field.addEventListener('input', () => {
        const key = field.id === 'quantityInput' ? 'quantity' : field.id;
        setFieldError(key, '');
      });
    });

    orderForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (isSubmitting) return;

      const honeypot = document.getElementById('website')?.value.trim();
      if (honeypot) {
        showStatus({
          type: 'error',
          title: 'Envoi bloqué',
          message: 'Votre demande n’a pas pu être validée. Veuillez réessayer.',
        });
        return;
      }

      if (Date.now() - pageLoadedAt < LAVIEDHOM_CONFIG.minFormTimeMs) {
        showStatus({
          type: 'warning',
          title: 'Un instant…',
          message: 'Veuillez vérifier vos coordonnées puis cliquer à nouveau.',
        });
        return;
      }

      try {
        const lastTs = Number(window.sessionStorage.getItem(COOLDOWN_KEY) || 0);
        const remaining = Math.ceil(
          (lastTs + LAVIEDHOM_CONFIG.cooldownSeconds * 1000 - Date.now()) / 1000
        );
        if (remaining > 0) {
          showStatus({
            type: 'warning',
            title: 'Demande déjà envoyée',
            message: `Merci de patienter ${remaining} seconde${remaining > 1 ? 's' : ''} avant d’envoyer une nouvelle demande.`,
          });
          return;
        }
      } catch {
        // ignore
      }

      const data = {
        product: productSelect?.value || 'Miel Ginger Laviedhom — 350 g',
        quantity: Number(quantityInput?.value || 1),
        firstName: (document.getElementById('firstName')?.value || '').trim(),
        lastName: (document.getElementById('lastName')?.value || '').trim(),
        phone: (document.getElementById('phone')?.value || '').trim(),
        email: (document.getElementById('email')?.value || '').trim(),
        deliveryNote: (document.getElementById('deliveryNote')?.value || '').trim(),
        privacyConsent: Boolean(document.getElementById('privacyConsent')?.checked),
        status: 'Nouvelle demande',
      };

      if (!validateForm(data)) return;

      isSubmitting = true;
      const originalBtnText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enregistrement en cours…';
      }

      const pricing = getPricingForQty(data.quantity);
      const waMessage = buildFormWhatsAppMessage(data);
      const waUrl = buildWhatsAppUrl(waMessage);

      const sheetResult = await saveToGoogleSheets({
        dateHeure: new Date().toLocaleString('fr-BE'),
        prenom: data.firstName,
        nom: data.lastName,
        telephone: data.phone,
        email: data.email,
        produitFormat: `${data.product} (${pricing.unitPrice} €/pot · Total ${pricing.total} €)`,
        quantite: pricing.quantity,
        statut: data.status,
        remarque: data.deliveryNote,
      });

      try {
        window.sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      } catch {
        // ignore
      }

      if (sheetResult.status === 'saved') {
        showStatus({
          type: 'success',
          title: 'Demande enregistrée',
          message:
            'Votre demande est bien enregistrée dans notre suivi. Cliquez sur « Ouvrir WhatsApp » ci-dessous si la fenêtre ne s’est pas ouverte automatiquement.',
          waMessage,
          waUrl,
        });
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      } else if (sheetResult.status === 'not_configured') {
        showStatus({
          type: 'success',
          title: 'Votre message WhatsApp est prêt',
          message:
            'Cliquez sur « Ouvrir WhatsApp » pour nous envoyer directement votre demande (ou copiez le message ci-dessous).',
          waMessage,
          waUrl,
        });
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      } else {
        showStatus({
          type: 'warning',
          title: 'Suivi automatique indisponible — WhatsApp reste prêt',
          message:
            'L’enregistrement automatique a échoué momentanément, mais votre message prérempli est prêt : cliquez sur « Ouvrir WhatsApp » pour envoyer votre demande.',
          waMessage,
          waUrl,
        });
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
      isSubmitting = false;
    });
  }
})();
