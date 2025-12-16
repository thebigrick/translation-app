// Email Template Types based on BigCommerce REST API

export type EmailTemplateTypeId =
  | "abandoned_cart_email"
  | "account_details_changed_email"
  | "combined_order_status_email"
  | "createaccount_email"
  | "createguestaccount_email"
  | "giftcertificate_email"
  | "invoice_email"
  | "ordermessage_notification"
  | "return_confirmation_email"
  | "return_statuschange_email"
  | "product_review_email"
  | "account_reset_password_email";

export interface EmailTemplateTranslation {
  locale: string;
  keys?: Record<string, string>;
}

export interface EmailTemplate {
  type_id: EmailTemplateTypeId;
  name: string;
  subject: string;
  body: string;
  translations?: EmailTemplateTranslation[];
}

export interface EmailTemplateUpdateData {
  type_id: EmailTemplateTypeId;
  subject: string;
  body: string;
  translations?: EmailTemplateTranslation[];
}

