// Fixture: Violation of react/no-danger
export function DangerFixture() {
  return <div dangerouslySetInnerHTML={{ __html: '<span>unsafe</span>' }} />;
}
