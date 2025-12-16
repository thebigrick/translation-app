import { NextRequest, NextResponse } from "next/server";
import { createRestClient } from "@bigcommerce/translations-rest-client";
import { getSessionFromContext } from "@/lib/auth";
import type { EmailTemplate, EmailTemplateUpdateData, EmailTemplateTranslation } from "@bigcommerce/translations-rest-client";
import { EMAIL_TEMPLATE_TYPES, extractTranslationKeysWithDefaults, extractTranslationKeys } from "@/lib/utils/email-template-helpers";
import { fallbackLocale } from "@/lib/constants";

// GET - Fetch email templates with translations
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const channelId = searchParams.get("channelId");
    const locale = searchParams.get("locale");

    if (!locale) {
      return NextResponse.json(
        { error: "locale is required" },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    // Get session from context
    const { accessToken, storeHash } = await getSessionFromContext(context);

    // Create REST client
    const restClient = createRestClient({
      accessToken,
      storeHash,
    });

    // Normalize channelId - convert 0 or empty string to undefined
    const normalizedChannelId = channelId && channelId !== '0' && channelId !== 'null' 
      ? Number(channelId) 
      : undefined;

    // IMPORTANT: BigCommerce API behavior:
    // - GET /v3/marketing/email-templates (no channel_id) → returns ALL global templates
    // - GET /v3/marketing/email-templates?channel_id=X → returns ONLY channel overrides (empty if none exist)
    // 
    // Strategy: Get global templates first, then merge with channel overrides if channelId is provided

    // Step 1: Get all global templates
    let globalTemplatesResponse;
    try {
      globalTemplatesResponse = await restClient.getEmailTemplates(undefined);
    } catch (apiError: any) {
      console.error('[Email Templates GET] Error fetching global templates:', apiError);
      globalTemplatesResponse = { data: [] };
    }

    // Parse global templates
    let globalTemplates: any[] = [];
    if (globalTemplatesResponse && typeof globalTemplatesResponse === 'object' && 'data' in globalTemplatesResponse) {
      if (Array.isArray(globalTemplatesResponse.data)) {
        globalTemplates = globalTemplatesResponse.data;
      } else if (globalTemplatesResponse.data && typeof globalTemplatesResponse.data === 'object') {
        globalTemplates = [globalTemplatesResponse.data];
      }
    } else if (Array.isArray(globalTemplatesResponse)) {
      globalTemplates = globalTemplatesResponse;
    }

    // Step 2: Get channel overrides if channelId is provided
    let channelOverrides: any[] = [];
    if (normalizedChannelId !== undefined) {
      try {
        const channelTemplatesResponse = await restClient.getEmailTemplates(normalizedChannelId);
        
        if (channelTemplatesResponse && typeof channelTemplatesResponse === 'object' && 'data' in channelTemplatesResponse) {
          if (Array.isArray(channelTemplatesResponse.data)) {
            channelOverrides = channelTemplatesResponse.data;
          } else if (channelTemplatesResponse.data && typeof channelTemplatesResponse.data === 'object') {
            channelOverrides = [channelTemplatesResponse.data];
          }
        } else if (Array.isArray(channelTemplatesResponse)) {
          channelOverrides = channelTemplatesResponse;
        }
      } catch (apiError: any) {
        channelOverrides = [];
      }
    }

    // Step 3: Create a map of channel overrides by template name/type_id
    const overrideMap = new Map<string, any>();
    channelOverrides.forEach((override: any) => {
      const key = override.name || override.type_id;
      if (key) {
        overrideMap.set(key, override);
      }
    });

    // Step 4: Get default locale for the channel (or fallback to "en")
    let defaultLocale = fallbackLocale.code;
    if (normalizedChannelId !== undefined) {
      try {
        const localesResponse = await restClient.getChannelLocales(normalizedChannelId);
        const locales = localesResponse.data || [];
        const defaultLocaleObj = locales.find((l: any) => l.is_default);
        if (defaultLocaleObj?.code) {
          defaultLocale = defaultLocaleObj.code;
        }
      } catch (error) {
        console.warn('[Email Templates GET] Could not fetch channel locales, using fallback:', error);
      }
    }

    // Normalize default locale for comparison
    let normalizedDefaultLocale = String(defaultLocale).trim().toLowerCase();
    if (normalizedDefaultLocale.includes('-')) {
      normalizedDefaultLocale = normalizedDefaultLocale.split('-')[0];
    }

    // Step 5: Merge global templates with channel overrides
    const mergedTemplates = globalTemplates.map((globalTemplate: any) => {
      const templateKey = globalTemplate.name || globalTemplate.type_id;
      const channelOverride = templateKey ? overrideMap.get(templateKey) : null;

      if (channelOverride) {
        return {
          ...globalTemplate,
          subject: channelOverride.subject || globalTemplate.subject,
          body: channelOverride.body || globalTemplate.body,
          translations: [
            ...(globalTemplate.translations || []).filter(
              (t: EmailTemplateTranslation) => 
                !channelOverride.translations?.some((co: EmailTemplateTranslation) => co.locale === t.locale)
            ),
            ...(channelOverride.translations || [])
          ],
          hasChannelOverride: true,
        };
      }

      return {
        ...globalTemplate,
        hasChannelOverride: false,
      };
    });

    // Step 6: Transform data to include translation for the requested locale
    const templatesWithTranslations = mergedTemplates.map((template: any) => {
      const templateName = template.name || template.type_id || 'unknown';
      
      // Normalize locale for comparison
      let normalizedLocale = String(locale).trim().toLowerCase();
      if (normalizedLocale.includes('-')) {
        normalizedLocale = normalizedLocale.split('-')[0];
      }
      
      // Find translation for the requested locale
      const translation = template.translations?.find(
        (t: EmailTemplateTranslation) => {
          let tLocale = String(t.locale || '').trim().toLowerCase();
          if (tLocale.includes('-')) {
            tLocale = tLocale.split('-')[0];
          }
          return tLocale === normalizedLocale;
        }
      );

      // Get default values from translations:
      // 1. First try channel translations for default locale (if channelId exists and has override)
      // 2. Then try global translations for default locale
      // 3. Fallback to extracting from template body
      let defaultValues: Record<string, string> = {};
      
      // First, try to get default values from channel translations (if channel override exists)
      if (normalizedChannelId !== undefined && template.hasChannelOverride) {
        const channelDefaultTranslation = template.translations?.find(
          (t: EmailTemplateTranslation) => {
            let tLocale = String(t.locale || '').trim().toLowerCase();
            if (tLocale.includes('-')) {
              tLocale = tLocale.split('-')[0];
            }
            return tLocale === normalizedDefaultLocale;
          }
        );
        if (channelDefaultTranslation?.keys && Object.keys(channelDefaultTranslation.keys).length > 0) {
          defaultValues = channelDefaultTranslation.keys;
        }
      }
      
      // If no channel default values found, try global translations
      if (Object.keys(defaultValues).length === 0) {
        const globalTemplate = globalTemplates.find(
          (gt: any) => (gt.name || gt.type_id) === templateName
        );
        if (globalTemplate) {
          const globalDefaultTranslation = globalTemplate.translations?.find(
            (t: EmailTemplateTranslation) => {
              let tLocale = String(t.locale || '').trim().toLowerCase();
              if (tLocale.includes('-')) {
                tLocale = tLocale.split('-')[0];
              }
              return tLocale === normalizedDefaultLocale;
            }
          );
          if (globalDefaultTranslation?.keys && Object.keys(globalDefaultTranslation.keys).length > 0) {
            defaultValues = globalDefaultTranslation.keys;
          }
        }
      }
      
      // If still no default values, extract from template body as fallback
      // This ensures we always have keys available, even if empty
      const bodyDefaultValues = extractTranslationKeysWithDefaults(template.body || '');
      const allKeys = extractTranslationKeys(template.body || '');
      
      // Merge: use translation values where available, otherwise use body defaults
      allKeys.forEach(key => {
        if (!defaultValues.hasOwnProperty(key)) {
          defaultValues[key] = bodyDefaultValues[key] || '';
        }
      });

      return {
        name: templateName,
        typeId: template.type_id,
        subject: template.subject || '',
        body: template.body || '',
        hasTranslation: !!translation,
        keys: translation?.keys || {},
        defaultValues: defaultValues,
        originalSubject: template.subject || '',
        originalBody: template.body || '',
        hasChannelOverride: template.hasChannelOverride || false,
      };
    });

    return NextResponse.json(templatesWithTranslations);
  } catch (error: any) {
    console.error("[Email Templates GET] Error fetching templates:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch email templates" },
      { status: 500 }
    );
  }
}

// PUT - Update email template translation keys
export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const body = await request.json();

    const { templateName, channelId, locale, keys } = body;

    if (!templateName || !locale) {
      return NextResponse.json(
        { error: "templateName and locale are required" },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    if (!keys || typeof keys !== 'object') {
      return NextResponse.json(
        { error: "keys object is required" },
        { status: 400 }
      );
    }

    // Normalize locale to 2-letter format (e.g., "en-US" -> "en")
    let normalizedLocale = String(locale || '').trim().toLowerCase();
    if (normalizedLocale.includes('-')) {
      normalizedLocale = normalizedLocale.split('-')[0];
    }
    
    if (normalizedLocale.length !== 2 || !/^[a-z]{2}$/.test(normalizedLocale)) {
      return NextResponse.json(
        { error: `Invalid locale format. Expected 2-letter code (e.g., "en", "it"), got: ${locale}` },
        { status: 400 }
      );
    }

    // Get session from context
    const { accessToken, storeHash } = await getSessionFromContext(context);

    // Create REST client
    const restClient = createRestClient({
      accessToken,
      storeHash,
    });

    // ChannelId is required for translations (never save to global template)
    if (!channelId || channelId === '0' || channelId === 'null' || channelId === 0) {
      return NextResponse.json(
        { error: "channelId is required for translations. Translations must be saved to a specific channel, not globally." },
        { status: 400 }
      );
    }

    const normalizedChannelId = Number(channelId);
    
    if (isNaN(normalizedChannelId) || normalizedChannelId <= 0) {
      return NextResponse.json(
        { error: `Invalid channelId: ${channelId}. Must be a positive number.` },
        { status: 400 }
      );
    }

    // Step 1: Get global template (required as base for type_id)
    let globalTemplate: any;
    try {
      const globalTemplateResponse = await restClient.getEmailTemplate(
        templateName,
        undefined
      );
      globalTemplate = globalTemplateResponse.data;
    } catch (globalError: any) {
      return NextResponse.json(
        { error: `Template ${templateName} not found: ${globalError.message}` },
        { status: 404 }
      );
    }

    if (!globalTemplate || !globalTemplate.type_id) {
      return NextResponse.json(
        { error: "Template data is invalid or missing required field (type_id)" },
        { status: 500 }
      );
    }

    // Step 2: Get channel override (create if doesn't exist)
    let currentTemplate: any;
    try {
      const channelTemplateResponse = await restClient.getEmailTemplate(
        templateName,
        normalizedChannelId
      );
      const channelTemplate = channelTemplateResponse.data;
      
      // Use channel template, fallback to global for subject/body if not set
      currentTemplate = {
        ...channelTemplate,
        type_id: globalTemplate.type_id, // Always use global type_id
        subject: channelTemplate.subject || globalTemplate.subject,
        body: channelTemplate.body || globalTemplate.body,
        translations: channelTemplate.translations || [],
      };
    } catch (channelError: any) {
      // Channel override doesn't exist - create new one based on global template
      if (channelError.status === 404 || channelError.message?.includes('404')) {
        currentTemplate = {
          ...globalTemplate,
          subject: globalTemplate.subject || '',
          body: globalTemplate.body || '',
          translations: [],
        };
      } else {
        return NextResponse.json(
          { error: `Error fetching channel template: ${channelError.message}` },
          { status: 500 }
        );
      }
    }

    // Step 3: Get existing translations (array format) from current template
    const existingTranslations: EmailTemplateTranslation[] = Array.isArray(currentTemplate.translations) 
      ? [...currentTemplate.translations]
      : [];

    // Step 4: Find existing translation for this locale
    const existingTranslationIndex = existingTranslations.findIndex(
      (t: EmailTemplateTranslation) => {
        let tLocale = String(t.locale || '').trim().toLowerCase();
        if (tLocale.includes('-')) {
          tLocale = tLocale.split('-')[0];
        }
        return tLocale === normalizedLocale;
      }
    );

    // Step 5: Create or update translation with keys
    const translation: EmailTemplateTranslation = {
      locale: normalizedLocale,
      keys: keys,
    };

    if (existingTranslationIndex >= 0) {
      // Update existing translation - merge keys
      existingTranslations[existingTranslationIndex] = {
        ...existingTranslations[existingTranslationIndex],
        keys: {
          ...existingTranslations[existingTranslationIndex].keys,
          ...keys,
        },
      };
    } else {
      // Add new translation
      existingTranslations.push(translation);
    }

    // Step 6: Prepare update data - keep original subject/body, update translations
    const updateData: EmailTemplateUpdateData = {
      type_id: currentTemplate.type_id,
      subject: currentTemplate.subject || '',
      body: currentTemplate.body || '',
      translations: existingTranslations,
    };

    // Step 7: Update template - ALWAYS save to channel (never global for translations)
    await restClient.updateEmailTemplate(
      currentTemplate.type_id,
      updateData,
      normalizedChannelId // Always use channelId - translations are channel-specific
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Email Templates PUT] Error updating email template translation:", error);
    
    if (error.status === 422 || error.message?.includes('422')) {
      const errorResponse = error.response || {};
      const errorMessage = errorResponse.title || 
                          errorResponse.message || 
                          errorResponse.error || 
                          error.message || 
                          "Validation error from BigCommerce API";
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: errorResponse.errors || errorResponse.details || errorResponse,
        },
        { status: 422 }
      );
    }
    
    return NextResponse.json(
      { 
        error: error.message || "Failed to update translation",
        details: error.response || error,
      },
      { status: error.status || 500 }
    );
  }
}
