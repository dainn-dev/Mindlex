using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace MyLaw.Data;

public sealed class MyLawDbContextFactory : IDesignTimeDbContextFactory<MyLawDbContext>
{
    public MyLawDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<MyLawDbContext>()
            .UseNpgsql(
                "Host=localhost;Port=55432;Database=mylaw;Username=postgres;Password=postgres",
                o => o.UseVector())
            .Options;
        return new MyLawDbContext(options);
    }
}
