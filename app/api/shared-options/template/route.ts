import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import {
  generateSharedOptionCSVHeaders,
  generateCSVTemplate,
} from '@/lib/utils/shared-option-helpers';

// GET /api/shared-options/template - Download CSV template
export async function GET(request: NextRequest) {
  try {
    // Get locales from query params or use defaults
    const searchParams = request.nextUrl.searchParams;
    const defaultLocale = searchParams.get('defaultLocale') || 'en';
    const targetLocale = searchParams.get('targetLocale') || 'it';

    // Generate template data
    const templateData = generateCSVTemplate(defaultLocale, targetLocale);
    const headers = generateSharedOptionCSVHeaders(defaultLocale, targetLocale);

    // Configure CSV generation
    const csvConfig = {
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ",",
      header: true,
      newline: "\n",
      skipEmptyLines: true,
    };

    // Format records for CSV
    const csvData = templateData.map((record) => {
      const row: Record<string, any> = {};
      headers.forEach((header) => {
        const value = (record as any)[header];
        row[header] = value === undefined || value === null ? "" : value;
      });
      return row;
    });

    // Generate CSV content
    const csvContent = Papa.unparse(
      {
        fields: headers,
        data: csvData,
      },
      csvConfig
    );

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="shared-options-template.csv"',
      },
    });
  } catch (error: any) {
    console.error('Error generating CSV template:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate template' },
      { status: 500 }
    );
  }
}

