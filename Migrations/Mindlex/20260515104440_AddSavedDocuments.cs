using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mindlex.Migrations.Mindlex
{
    /// <inheritdoc />
    public partial class AddSavedDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SavedDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    DocumentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TagsCsv = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    EditedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Content = table.Column<byte[]>(type: "bytea", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SourceMessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceThreadId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedDocuments", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SavedDocuments_OwnerId",
                table: "SavedDocuments",
                column: "OwnerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SavedDocuments");
        }
    }
}
