// Vercel function: tells the static UI it is running in public mode.
module.exports=(req,res)=>{res.setHeader('cache-control','no-store');res.status(200).json({public:true,platform:'vercel'})};
