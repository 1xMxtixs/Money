// Fixture: Violation of Rule 1 (lib/domain must not import next, app, or lib/db)
import { NextResponse } from 'next/server';
import { HomePage } from '@/app/page';
import { db } from '@/lib/db';

export function testDomainViolation() {
  return { NextResponse, HomePage, db };
}
