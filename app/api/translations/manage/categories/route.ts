import { NextRequest, NextResponse } from "next/server";
import { createGraphQLClient } from "@bigcommerce/translations-graphql-client";
import { dbClient as db } from "@/lib/db";

// GET - Fetch categories with translations
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const channelId = searchParams.get("channelId");
    const locale = searchParams.get("locale");

    if (!channelId || !locale) {
      return NextResponse.json(
        { error: "channelId and locale are required" },
        { status: 400 }
      );
    }

    // Get store hash from context
    const storeHash = context?.split("/")[1];
    if (!storeHash) {
      return NextResponse.json(
        { error: "Invalid context" },
        { status: 400 }
      );
    }

    // Get access token
    const accessToken = await db.getStoreToken(storeHash);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Store token not found" },
        { status: 404 }
      );
    }

    // Create GraphQL client
    const graphqlClient = createGraphQLClient(accessToken, storeHash);

    // Fetch categories
    const result = await graphqlClient.getCategoryTranslations({
      channelId: Number(channelId),
      locale,
      first: 250,
    });

    // Transform data
    const categories = (result.edges || []).map((edge: any) => ({
      id: parseInt(edge.node.id.split("/").pop() || "0", 10),
      name: edge.node.name,
      translation: edge.node.overridesForLocale?.name || "",
    }));

    return NextResponse.json(categories);
  } catch (error: any) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// PUT - Update category translation
export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const body = await request.json();

    const { categoryId, channelId, locale, translation } = body;

    if (!categoryId || !channelId || !locale) {
      return NextResponse.json(
        { error: "categoryId, channelId, and locale are required" },
        { status: 400 }
      );
    }

    // Get store hash from context
    const storeHash = context?.split("/")[1];
    if (!storeHash) {
      return NextResponse.json(
        { error: "Invalid context" },
        { status: 400 }
      );
    }

    // Get access token
    const accessToken = await db.getStoreToken(storeHash);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Store token not found" },
        { status: 404 }
      );
    }

    // Create GraphQL client
    const graphqlClient = createGraphQLClient(accessToken, storeHash);

    // Update category translation
    const fields = [];
    if (translation) {
      fields.push({
        fieldName: "name",
        value: translation,
      });
    }

    if (fields.length > 0) {
      await graphqlClient.updateCategoryTranslations({
        channelId: Number(channelId),
        locale,
        categories: [
          {
            categoryId: Number(categoryId),
            fields,
          },
        ],
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating category translation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update translation" },
      { status: 500 }
    );
  }
}

